import { t } from "@lingui/core/macro";
import {
  HiArrowDownTray,
  HiArrowUpTray,
  HiEllipsisHorizontal,
  HiLink,
  HiOutlineDocumentDuplicate,
  HiOutlineTrash,
} from "react-icons/hi2";

import Dropdown from "~/components/Dropdown";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

export default function BoardDropdown({
  isTemplate,
  isLoading,
  boardPublicId,
  workspacePublicId,
}: {
  isTemplate: boolean;
  isLoading: boolean;
  boardPublicId: string;
  workspacePublicId: string;
}) {
  const { openModal } = useModal();
  const exportMutation = api.jsonImport.exportCards.useQuery(
    { boardPublicId },
    { enabled: false },
  );

  const handleExport = async () => {
    try {
      const result = await exportMutation.refetch();
      if (result.data) {
        // Create a blob and download it
        const blob = new Blob([result.data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `board-export-${boardPublicId}-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  return (
    <Dropdown
      disabled={isLoading}
      items={[
        ...(isTemplate
          ? []
          : [
              {
                label: t`Import from JSON`,
                action: () => openModal("IMPORT_JSON"),
                icon: (
                  <HiArrowDownTray className="h-[16px] w-[16px] text-dark-900" />
                ),
              },
              {
                label: t`Export to JSON`,
                action: handleExport,
                icon: (
                  <HiArrowUpTray className="h-[16px] w-[16px] text-dark-900" />
                ),
              },
              {
                label: t`Make template`,
                action: () => openModal("CREATE_TEMPLATE"),
                icon: (
                  <HiOutlineDocumentDuplicate className="h-[16px] w-[16px] text-dark-900" />
                ),
              },
              {
                label: t`Edit board URL`,
                action: () => openModal("UPDATE_BOARD_SLUG"),
                icon: <HiLink className="h-[16px] w-[16px] text-dark-900" />,
              },
            ]),

        {
          label: isTemplate ? t`Delete template` : t`Delete board`,
          action: () => openModal("DELETE_BOARD"),
          icon: <HiOutlineTrash className="h-[16px] w-[16px] text-dark-900" />,
        },
      ]}
    >
      <HiEllipsisHorizontal className="h-5 w-5 text-dark-900" />
    </Dropdown>
  );
}
