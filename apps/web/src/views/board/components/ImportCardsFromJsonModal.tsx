import { useState } from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
  HiChevronDown,
  HiChevronUp,
  HiXMark,
  HiCheckCircle,
  HiExclamationTriangle,
} from "react-icons/hi2";

import { JSON_IMPORT_TEMPLATE_STRING } from "@kan/shared/constants";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

interface ImportCardsFromJsonModalProps {
  boardPublicId: string;
}

export function ImportCardsFromJsonModal({
  boardPublicId,
}: ImportCardsFromJsonModalProps) {
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const [jsonInput, setJsonInput] = useState("");
  const [showTemplate, setShowTemplate] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const importCards = api.jsonImport.importCards.useMutation({
    onSuccess: async (data) => {
      const warningMessage =
        data.warnings.length > 0
          ? `\n\nWarnings:\n${data.warnings.slice(0, 5).join("\n")}${data.warnings.length > 5 ? `\n...and ${data.warnings.length - 5} more` : ""}`
          : "";

      showPopup({
        header: t`Import complete`,
        message: t`Successfully imported ${data.cardsCreated} cards into "${data.listName}"${warningMessage}`,
        icon: "success",
      });

      await utils.board.byId.invalidate();
      closeModal();
    },
    onError: (error) => {
      setValidationError(error.message);
    },
  });

  const handleValidate = () => {
    setValidationError(null);

    if (!jsonInput.trim()) {
      setValidationError(t`Please enter JSON data`);
      return;
    }

    try {
      JSON.parse(jsonInput);
      showPopup({
        header: t`Valid JSON`,
        message: t`Your JSON is valid and ready to import`,
        icon: "success",
      });
    } catch (error) {
      setValidationError(
        t`Invalid JSON format: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleImport = () => {
    setValidationError(null);

    if (!jsonInput.trim()) {
      setValidationError(t`Please enter JSON data`);
      return;
    }

    importCards.mutate({
      boardPublicId,
      data: jsonInput,
    });
  };

  const handleUseTemplate = () => {
    setJsonInput(JSON_IMPORT_TEMPLATE_STRING);
    setShowTemplate(false);
  };

  return (
    <div className="flex flex-col">
      <div className="flex w-full items-center justify-between px-5 pb-4 pt-5">
        <h2 className="text-sm font-medium text-neutral-900 dark:text-dark-1000">
          <Trans>Import Cards from JSON</Trans>
        </h2>
        <button
          type="button"
          className="rounded p-1 hover:bg-light-200 dark:hover:bg-dark-300"
          onClick={() => closeModal()}
        >
          <HiXMark size={18} className="text-dark-900" />
        </button>
      </div>

      <div className="space-y-4 px-5 pb-5">
        {/* Template Section */}
        <div className="rounded-lg border border-light-500 bg-light-100 dark:border-dark-400 dark:bg-dark-300">
          <button
            type="button"
            onClick={() => setShowTemplate(!showTemplate)}
            className="flex w-full items-center justify-between p-3 text-left hover:bg-light-200 dark:hover:bg-dark-400"
          >
            <span className="text-sm font-medium text-neutral-900 dark:text-dark-1000">
              <Trans>JSON Template</Trans>
            </span>
            {showTemplate ? (
              <HiChevronUp className="h-5 w-5 text-neutral-500" />
            ) : (
              <HiChevronDown className="h-5 w-5 text-neutral-500" />
            )}
          </button>

          {showTemplate && (
            <div className="border-t border-light-500 p-3 dark:border-dark-400">
              <pre className="overflow-x-auto rounded bg-light-300 p-3 text-xs text-neutral-900 dark:bg-dark-500 dark:text-dark-1000">
                {JSON_IMPORT_TEMPLATE_STRING}
              </pre>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleUseTemplate}
                className="mt-3"
              >
                <Trans>Use this template</Trans>
              </Button>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
          <p className="text-xs text-blue-900 dark:text-blue-100">
            <Trans>
              Paste your JSON data below. The JSON should include a list name
              and an array of cards with optional labels and checklists.
            </Trans>
          </p>
        </div>

        {/* JSON Input */}
        <div>
          <label
            htmlFor="json-input"
            className="mb-2 block text-sm font-medium text-neutral-900 dark:text-dark-1000"
          >
            <Trans>JSON Data</Trans>
          </label>
          <textarea
            id="json-input"
            value={jsonInput}
            onChange={(e) => {
              setJsonInput(e.target.value);
              setValidationError(null);
            }}
            placeholder={t`Paste your JSON here...`}
            className="block h-64 w-full rounded-md border-0 bg-white/5 px-3 py-2 font-mono text-xs shadow-sm ring-1 ring-inset ring-light-600 placeholder:text-dark-800 focus:ring-2 focus:ring-inset focus:ring-light-700 dark:text-dark-1000 dark:ring-dark-700 dark:focus:ring-dark-700"
          />
        </div>

        {/* Validation Error */}
        {validationError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
            <HiExclamationTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-xs text-red-900 dark:text-red-100">
              {validationError}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleValidate}
            disabled={importCards.isPending}
            fullWidth
          >
            <Trans>Validate JSON</Trans>
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleImport}
            isLoading={importCards.isPending}
            disabled={!jsonInput.trim() || importCards.isPending}
            fullWidth
          >
            <Trans>Import Cards</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}

