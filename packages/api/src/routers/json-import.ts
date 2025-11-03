import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, eq, inArray, isNull, desc } from "drizzle-orm";

import * as boardRepo from "@kan/db/repository/board.repo";
import * as cardRepo from "@kan/db/repository/card.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as checklistRepo from "@kan/db/repository/checklist.repo";
import * as importRepo from "@kan/db/repository/import.repo";
import * as labelRepo from "@kan/db/repository/label.repo";
import * as listRepo from "@kan/db/repository/list.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { colours } from "@kan/shared/constants";
import { generateUID } from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertUserInWorkspace } from "../utils/auth";

// Zod schemas for validation
const ChecklistItemSchema = z.object({
  title: z.string().min(1).max(500),
  completed: z.boolean().default(false),
});

const ChecklistSchema = z.object({
  name: z.string().min(1).max(255),
  items: z.array(ChecklistItemSchema).max(50),
});

const CardSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional().default(""),
  labels: z.array(z.string().max(50)).max(20).optional().default([]),
  checklists: z.array(ChecklistSchema).max(10).optional().default([]),
});

const ListSchema = z.object({
  listName: z.string().min(1).max(255),
  cards: z.array(CardSchema).min(0).max(500),
});

// Support both single list and array of lists
const ImportJsonSchema = z.union([
  ListSchema,
  z.array(ListSchema).min(1).max(50),
]);

type ImportWarning = string;

export const jsonImportRouter = createTRPCRouter({
  importCards: protectedProcedure
    .meta({
      openapi: {
        summary: "Import cards from JSON",
        method: "POST",
        path: "/import/json",
        description: "Imports cards from JSON data into a board",
        tags: ["Import"],
        protect: true,
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
        data: z.string(), // JSON string
      }),
    )
    .output(
      z.object({
        cardsCreated: z.number(),
        listsProcessed: z.number(),
        warnings: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      // Parse JSON
      let parsedData: unknown;
      try {
        console.log("Parsing JSON, length:", input.data.length);
        parsedData = JSON.parse(input.data);
        console.log("JSON parsed successfully, type:", typeof parsedData, "isArray:", Array.isArray(parsedData));
      } catch (error) {
        console.error("JSON parse error:", error);
        throw new TRPCError({
          message: "Invalid JSON format",
          code: "BAD_REQUEST",
        });
      }

      // Preprocess data to ensure all optional fields exist
      console.log("Starting preprocessing...");
      try {
        const preprocessCards = (cards: any[]) => {
          return cards.map((card: any, index: number) => {
            console.log(`Preprocessing card ${index}:`, card?.title);

            // Ensure card object exists
            if (!card || typeof card !== 'object') {
              console.error(`Card ${index} is invalid:`, card);
              throw new TRPCError({
                message: `Card at index ${index} is invalid`,
                code: "BAD_REQUEST",
              });
            }

            const processedChecklists = Array.isArray(card.checklists)
              ? card.checklists
                .filter((cl: any) => cl != null && typeof cl === 'object' && cl.name && typeof cl.name === 'string')
                .map((checklist: any) => {
                  const processedItems = Array.isArray(checklist.items)
                    ? checklist.items
                      .filter((item: any) => {
                        const isValid = item != null && typeof item === 'object' && item.title && typeof item.title === 'string';
                        if (!isValid) {
                          console.warn(`Filtering out invalid item:`, item);
                        }
                        return isValid;
                      })
                      .map((item: any) => ({
                        title: item.title,
                        completed: item.completed ?? false,
                      }))
                    : [];

                  console.log(`Checklist "${checklist.name}" has ${processedItems.length} items after filtering`);
                  return {
                    name: checklist.name,
                    items: processedItems,
                  };
                })
              : [];

            console.log(`Card "${card.title}" has ${processedChecklists.length} checklists after filtering`);

            return {
              title: card.title ?? "",
              description: card.description ?? "",
              labels: Array.isArray(card.labels) ? card.labels.filter((l: any) => l != null) : [],
              checklists: processedChecklists,
            };
          });
        };

        // Handle array of lists
        if (Array.isArray(parsedData)) {
          console.log("Preprocessing array of", parsedData.length, "lists");
          parsedData = parsedData.map((list: any, index: number) => {
            console.log(`Preprocessing list ${index}:`, { listName: list?.listName, cardsCount: Array.isArray(list?.cards) ? list.cards.length : 0 });

            // Validate list object
            if (!list || typeof list !== 'object') {
              console.error(`List ${index} is invalid:`, list);
              throw new TRPCError({
                message: `List at index ${index} is invalid`,
                code: "BAD_REQUEST",
              });
            }

            if (!list.listName || typeof list.listName !== 'string') {
              console.error(`List ${index} has invalid listName:`, list.listName);
              throw new TRPCError({
                message: `List at index ${index} has invalid or missing listName`,
                code: "BAD_REQUEST",
              });
            }

            return {
              listName: list.listName.trim(),
              cards: preprocessCards(Array.isArray(list.cards) ? list.cards : []),
            };
          });
        }
        // Handle single list object
        else if (typeof parsedData === "object" && parsedData !== null && "cards" in parsedData) {
          const data = parsedData as { listName?: string; cards?: unknown[] };
          if (Array.isArray(data.cards)) {
            console.log("Preprocessing single list with", data.cards.length, "cards");
            parsedData = {
              listName: data.listName,
              cards: preprocessCards(data.cards),
            };
          }
        }
        console.log("Preprocessing complete");
      } catch (error) {
        console.error("Preprocessing error:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          message: `Preprocessing failed: ${error instanceof Error ? error.message : String(error)}`,
          code: "BAD_REQUEST",
        });
      }

      // Validate structure
      const validationResult = ImportJsonSchema.safeParse(parsedData);
      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map((e) => {
          const path = e.path.join(".");
          return `${path}: ${e.message}`;
        });
        throw new TRPCError({
          message: `Invalid data structure:\n${errorMessages.join("\n")}`,
          code: "BAD_REQUEST",
        });
      }

      const importData = validationResult.data;
      const warnings: ImportWarning[] = [];

      // Normalize to array of lists
      const listsToImport = Array.isArray(importData) ? importData : [importData];

      console.log("Importing", listsToImport.length, "list(s)");

      // Count total cards
      const totalCards = listsToImport.reduce((sum, list) => sum + list.cards.length, 0);
      console.log("Total cards to import:", totalCards);

      // Get board and verify access
      const board = await ctx.db.query.boards.findFirst({
        where: (boards, { eq }) => eq(boards.publicId, input.boardPublicId),
        columns: {
          id: true,
          workspaceId: true,
          publicId: true,
        },
      });

      if (!board) {
        throw new TRPCError({
          message: "Board not found",
          code: "NOT_FOUND",
        });
      }

      const workspace = await workspaceRepo.getById(ctx.db, board.workspaceId);

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertUserInWorkspace(ctx.db, userId, workspace.id);

      // Create import record
      const newImport = await importRepo.create(ctx.db, {
        source: "json",
        createdBy: userId,
      });

      const newImportId = newImport?.id;

      if (!newImportId) {
        throw new TRPCError({
          message: "Failed to create import record",
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      let allCreatedCards: Awaited<ReturnType<typeof cardRepo.bulkCreate>> = [];

      try {
        console.log("Starting import process...");

        // Get existing lists once
        const existingLists = await ctx.db.query.lists.findMany({
          where: (lists, { eq, and, isNull }) =>
            and(eq(lists.boardId, board.id), isNull(lists.deletedAt)),
          columns: {
            id: true,
            name: true,
          },
        });

        // Get existing labels for the board once
        const existingLabels = await ctx.db.query.labels.findMany({
          where: (labels, { eq, and, isNull }) =>
            and(eq(labels.boardId, board.id), isNull(labels.deletedAt)),
          columns: {
            id: true,
            name: true,
          },
        });

        // Collect ALL unique label names from ALL lists
        console.log("Collecting all label names...");
        const allLabelNames = new Set<string>();
        for (const listData of listsToImport) {
          for (const card of listData.cards) {
            if (card && card.labels && card.labels.length > 0) {
              for (const labelName of card.labels) {
                if (typeof labelName === "string" && labelName.trim() !== "") {
                  allLabelNames.add(labelName.trim());
                }
              }
            }
          }
        }
        console.log("Label names collected:", Array.from(allLabelNames));

        // Create missing labels
        const labelMap = new Map<string, number>();
        existingLabels.forEach((label) => {
          labelMap.set(label.name.toLowerCase(), label.id);
        });

        const labelsToCreate: string[] = [];
        for (const labelName of allLabelNames) {
          if (!labelMap.has(labelName.toLowerCase())) {
            labelsToCreate.push(labelName);
          }
        }

        if (labelsToCreate.length > 0) {
          const newLabels = await labelRepo.bulkCreate(
            ctx.db,
            labelsToCreate.map((name, index) => ({
              publicId: generateUID(),
              name,
              colourCode:
                colours[(existingLabels.length + index) % colours.length]
                  ?.code ?? "#0d9488",
              createdBy: userId,
              boardId: board.id,
              importId: newImportId,
            })),
          );

          // bulkCreate returns only { id }, so align by input order to map name -> id
          labelsToCreate.forEach((name, i) => {
            const created = newLabels[i];
            if (created) {
              labelMap.set(name.toLowerCase(), created.id);
            }
          });
        }

        // Process each list
        for (const listData of listsToImport) {
          // Validate listData
          if (!listData || typeof listData.listName !== 'string' || !listData.listName.trim()) {
            console.error("Invalid list data:", listData);
            throw new TRPCError({
              message: "Invalid list data: listName is required and must be a non-empty string",
              code: "BAD_REQUEST",
            });
          }

          console.log(`Processing list: "${listData.listName}" with ${listData.cards.length} cards`);

          // Skip lists with no cards
          if (listData.cards.length === 0) {
            console.log(`Skipping empty list: "${listData.listName}"`);
            continue;
          }

          // Find or create list
          let targetList = existingLists.find(
            (list) => list.name && typeof list.name === 'string' && list.name.toLowerCase() === listData.listName.toLowerCase(),
          );

          if (!targetList) {
            const newList = await listRepo.create(ctx.db, {
              name: listData.listName,
              createdBy: userId,
              boardId: board.id,
              importId: newImportId,
            });

            if (!newList?.id) {
              throw new TRPCError({
                message: `Failed to create list "${listData.listName}"`,
                code: "INTERNAL_SERVER_ERROR",
              });
            }

            targetList = { id: newList.id, name: newList.name };
            existingLists.push(targetList);
          }

          // Prepare cards for bulk insert with mapping to original data
          const publicIdToCardData = new Map<string, typeof listData.cards[0]>();
          const cardsToInsert = listData.cards.map((card, index) => {
            const publicId = generateUID();
            publicIdToCardData.set(publicId, card);
            return {
              publicId,
              title: card.title.substring(0, 255),
              description: (card.description || "").substring(0, 10000),
              createdBy: userId,
              listId: targetList.id,
              index,
              importId: newImportId,
            };
          });

          // Track warnings for truncations
          listData.cards.forEach((card, index) => {
            if (card.title.length > 255) {
              warnings.push(
                `List "${listData.listName}", Card ${index + 1} "${card.title.substring(0, 50)}...": Title truncated from ${card.title.length} to 255 characters`,
              );
            }
            if (card.description && card.description.length > 10000) {
              warnings.push(
                `List "${listData.listName}", Card ${index + 1} "${card.title}": Description truncated from ${card.description.length} to 10,000 characters`,
              );
            }
          });

          // Bulk create cards
          const createdCards = await cardRepo.bulkCreate(ctx.db, cardsToInsert);

          if (createdCards.length === 0) {
            throw new TRPCError({
              message: `Failed to create cards for list "${listData.listName}"`,
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          // Add to all created cards
          allCreatedCards.push(...createdCards);

          // Create card activities
          const activities = createdCards.map((card) => ({
            type: "card.created" as const,
            cardId: card.id,
            createdBy: userId,
          }));

          await cardActivityRepo.bulkCreate(ctx.db, activities);

          // Create card-label relationships
          const cardLabelRelations: { cardId: number; labelId: number }[] = [];

          createdCards.forEach((createdCard) => {
            const cardData = publicIdToCardData.get(createdCard.publicId);
            if (!cardData || !cardData.labels || cardData.labels.length === 0) return;

            const uniqueLabels = new Set(
              cardData.labels
                .filter((l): l is string => typeof l === "string" && l.trim() !== "")
                .map((l) => l.toLowerCase()),
            );

            for (const labelName of uniqueLabels) {
              const labelId = labelMap.get(labelName.toLowerCase());
              if (labelId) {
                cardLabelRelations.push({
                  cardId: createdCard.id,
                  labelId,
                });
              }
            }

            // Warn about duplicate labels
            if (uniqueLabels.size < cardData.labels.length) {
              warnings.push(
                `List "${listData.listName}", Card "${cardData.title}": Duplicate labels removed`,
              );
            }
          });

          if (cardLabelRelations.length > 0) {
            await cardRepo.bulkCreateCardLabelRelationship(
              ctx.db,
              cardLabelRelations,
            );
          }

          // Create checklists and items
          console.log(`Creating checklists for ${createdCards.length} cards in list "${listData.listName}"`);
          console.log(`publicIdToCardData has ${publicIdToCardData.size} entries`);

          for (const createdCard of createdCards) {
            console.log(`Looking up card with publicId: ${createdCard.publicId}`);
            const cardData = publicIdToCardData.get(createdCard.publicId);

            console.log(`Card data found:`, cardData ? `yes, title: "${cardData.title}", checklists: ${cardData.checklists?.length || 0}` : 'NO');

            if (!createdCard || !cardData || !cardData.checklists || cardData.checklists.length === 0) {
              console.log(`Skipping card because: createdCard=${!!createdCard}, cardData=${!!cardData}, hasChecklists=${!!(cardData?.checklists)}, checklistsLength=${cardData?.checklists?.length || 0}`);
              continue;
            }

            console.log(`Card "${cardData.title}" has ${cardData.checklists.length} checklist(s)`);

            for (let j = 0; j < cardData.checklists.length; j++) {
              const checklistData = cardData.checklists[j];
              if (!checklistData) continue;

              console.log(`Creating checklist "${checklistData.name}" with ${checklistData.items?.length || 0} items`);

              const checklist = await checklistRepo.create(ctx.db, {
                name: checklistData.name.substring(0, 255),
                cardId: createdCard.id,
                createdBy: userId,
              });

              if (!checklist?.id) {
                console.error(`Failed to create checklist "${checklistData.name}"`);
                continue;
              }

              console.log(`Checklist created with ID: ${checklist.id}`);

              // Warn about checklist name truncation
              if (checklistData.name.length > 255) {
                warnings.push(
                  `List "${listData.listName}", Card "${cardData.title}", Checklist ${j + 1}: Name truncated from ${checklistData.name.length} to 255 characters`,
                );
              }

              // Create checklist items
              console.log(`Creating ${checklistData.items.length} items for checklist "${checklistData.name}"`);
              for (let k = 0; k < checklistData.items.length; k++) {
                const itemData = checklistData.items[k];
                if (!itemData) {
                  console.warn(`Item ${k} is null/undefined, skipping`);
                  continue;
                }

                console.log(`Creating item ${k}: "${itemData.title}"`);
                const createdItem = await checklistRepo.createItem(ctx.db, {
                  title: itemData.title.substring(0, 500),
                  checklistId: checklist.id,
                  createdBy: userId,
                });

                if (!createdItem) {
                  console.error(`Failed to create item "${itemData.title}"`);
                } else {
                  console.log(`Item created with ID: ${createdItem.id}`);
                }

                // Warn about item title truncation
                if (itemData.title.length > 500) {
                  warnings.push(
                    `List "${listData.listName}", Card "${cardData.title}", Checklist ${j + 1}, Item ${k + 1}: Title truncated from ${itemData.title.length} to 500 characters`,
                  );
                }
              }
            }
          }
        } // End of list processing loop

        // Mark import as successful
        await importRepo.update(
          ctx.db,
          { status: "success" },
          { importId: newImportId },
        );

        return {
          cardsCreated: allCreatedCards.length,
          listsProcessed: listsToImport.length,
          warnings,
        };
      } catch (error) {
        console.error("Import error:", error);

        // Mark import as failed
        await importRepo.update(
          ctx.db,
          { status: "failed" },
          { importId: newImportId },
        );

        // Re-throw with more context
        if (error instanceof Error) {
          throw new TRPCError({
            message: `Import failed: ${error.message}`,
            code: "INTERNAL_SERVER_ERROR",
            cause: error,
          });
        }

        throw error;
      }
    }),

  exportCards: protectedProcedure
    .meta({
      openapi: {
        summary: "Export board to JSON",
        method: "GET",
        path: "/export/json/{boardPublicId}",
        description: "Exports all lists and cards from a board to JSON format",
      },
    })
    .input(
      z.object({
        boardPublicId: z.string().min(12),
      }),
    )
    .output(z.string()) // JSON string
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      // Get board and verify access
      const board = await ctx.db.query.boards.findFirst({
        where: (boards, { eq }) => eq(boards.publicId, input.boardPublicId),
        columns: {
          id: true,
          workspaceId: true,
          publicId: true,
          name: true,
        },
      });

      if (!board) {
        throw new TRPCError({
          message: "Board not found",
          code: "NOT_FOUND",
        });
      }

      const workspace = await workspaceRepo.getById(ctx.db, board.workspaceId);

      if (!workspace) {
        throw new TRPCError({
          message: "Workspace not found",
          code: "NOT_FOUND",
        });
      }

      await assertUserInWorkspace(ctx.db, userId, workspace.id);

      // Get all lists for the board
      const lists = await ctx.db.query.lists.findMany({
        where: (lists, { eq, and, isNull }) =>
          and(eq(lists.boardId, board.id), isNull(lists.deletedAt)),
        columns: {
          id: true,
          name: true,
          index: true,
        },
        orderBy: (lists, { asc }) => [asc(lists.index)],
      });

      // Get all cards for the board
      const allCards = await ctx.db.query.cards.findMany({
        where: (cards, { eq, and, isNull, inArray }) =>
          and(
            inArray(
              cards.listId,
              lists.map((l) => l.id),
            ),
            isNull(cards.deletedAt),
          ),
        columns: {
          id: true,
          publicId: true,
          title: true,
          description: true,
          listId: true,
          index: true,
        },
        orderBy: (cards, { asc }) => [asc(cards.index)],
      });

      // Get all labels for cards
      const cardIds = allCards.map((c) => c.id);
      const cardLabels = cardIds.length > 0
        ? await ctx.db.query.cardsToLabels.findMany({
          where: (ctl, { inArray }) => inArray(ctl.cardId, cardIds),
          with: {
            label: {
              columns: {
                name: true,
              },
            },
          },
        })
        : [];

      // Get all checklists for cards
      const checklists = cardIds.length > 0
        ? await ctx.db.query.checklists.findMany({
          where: (checklists, { inArray, isNull }) =>
            and(
              inArray(checklists.cardId, cardIds),
              isNull(checklists.deletedAt),
            ),
          columns: {
            id: true,
            cardId: true,
            name: true,
            index: true,
          },
          orderBy: (checklists, { asc }) => [asc(checklists.index)],
        })
        : [];

      // Get all checklist items
      const checklistIds = checklists.map((cl) => cl.id);
      const checklistItems = checklistIds.length > 0
        ? await ctx.db.query.checklistItems.findMany({
          where: (items, { inArray, isNull }) =>
            and(
              inArray(items.checklistId, checklistIds),
              isNull(items.deletedAt),
            ),
          columns: {
            checklistId: true,
            title: true,
            completed: true,
            index: true,
          },
          orderBy: (items, { asc }) => [asc(items.index)],
        })
        : [];

      // Build the export structure
      const exportData = lists.map((list) => {
        const listCards = allCards.filter((c) => c.listId === list.id);

        return {
          listName: list.name,
          cards: listCards.map((card) => {
            // Get labels for this card
            const labels = cardLabels
              .filter((cl) => cl.cardId === card.id)
              .map((cl) => cl.label.name);

            // Get checklists for this card
            const cardChecklists = checklists.filter(
              (cl) => cl.cardId === card.id,
            );

            return {
              title: card.title,
              description: card.description || "",
              labels,
              checklists: cardChecklists.map((checklist) => {
                // Get items for this checklist
                const items = checklistItems
                  .filter((item) => item.checklistId === checklist.id)
                  .map((item) => ({
                    title: item.title,
                    completed: item.completed,
                  }));

                return {
                  name: checklist.name,
                  items,
                };
              }),
            };
          }),
        };
      });

      return JSON.stringify(exportData, null, 2);
    }),
});

