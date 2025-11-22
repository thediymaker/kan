import { and, eq, isNull } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { cardAttachments } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const create = async (
  db: dbClient,
  input: {
    cardId: number;
    fileName: string;
    fileSize: number;
    fileType: string;
    filePath: string;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(cardAttachments)
    .values({
      publicId: generateUID(),
      cardId: input.cardId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      fileType: input.fileType,
      filePath: input.filePath,
      createdBy: input.createdBy,
    })
    .returning();

  return result;
};

export const getByPublicId = (db: dbClient, publicId: string) => {
  return db.query.cardAttachments.findFirst({
    where: and(
      eq(cardAttachments.publicId, publicId),
      isNull(cardAttachments.deletedAt),
    ),
  });
};

export const getAllByCardId = (db: dbClient, cardId: number) => {
  return db.query.cardAttachments.findMany({
    where: and(
      eq(cardAttachments.cardId, cardId),
      isNull(cardAttachments.deletedAt),
    ),
    orderBy: (cardAttachments, { desc }) => [desc(cardAttachments.createdAt)],
  });
};

export const softDelete = async (
  db: dbClient,
  args: {
    attachmentId: number;
    deletedBy: string;
  },
) => {
  const [result] = await db
    .update(cardAttachments)
    .set({
      deletedAt: new Date(),
      deletedBy: args.deletedBy,
    })
    .where(eq(cardAttachments.id, args.attachmentId))
    .returning();

  return result;
};


