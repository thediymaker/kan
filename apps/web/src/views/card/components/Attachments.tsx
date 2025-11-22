import { t } from "@lingui/core/macro";
import { useRef, useState } from "react";
import { HiOutlinePaperClip, HiPhoto, HiTrash } from "react-icons/hi2";

import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

export default function Attachments({
  cardPublicId,
  coverAttachmentId,
}: {
  cardPublicId: string;
  coverAttachmentId: number | null | undefined;
}) {
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: attachments } = api.card.getAttachments.useQuery({
    cardPublicId,
  });

  const getPresignedUrl = api.card.getPresignedUploadUrl.useMutation();
  const createAttachment = api.card.createAttachment.useMutation({
    onSuccess: () => {
      utils.card.getAttachments.invalidate({ cardPublicId });
      utils.card.byId.invalidate({ cardPublicId });
      setIsUploading(false);
    },
    onError: () => {
      showPopup({
        header: t`Upload failed`,
        message: t`Failed to upload attachment`,
        icon: "error",
      });
      setIsUploading(false);
    },
  });

  const deleteAttachment = api.card.deleteAttachment.useMutation({
    onSuccess: () => {
      utils.card.getAttachments.invalidate({ cardPublicId });
      utils.card.byId.invalidate({ cardPublicId });
    },
    onError: () => {
      showPopup({
        header: t`Delete failed`,
        message: t`Failed to delete attachment`,
        icon: "error",
      });
    },
  });

  const setCoverImage = api.card.setCoverImage.useMutation({
    onSuccess: () => {
      utils.card.byId.invalidate({ cardPublicId });
    },
    onError: () => {
      showPopup({
        header: t`Update failed`,
        message: t`Failed to update cover image`,
        icon: "error",
      });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      // 1. Get presigned URL
      const { uploadUrl, filePath } = await getPresignedUrl.mutateAsync({
        cardPublicId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      // 2. Upload to S3
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      // 3. Create attachment record
      await createAttachment.mutateAsync({
        cardPublicId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        filePath,
      });
    } catch (error) {
      console.error(error);
      showPopup({
        header: t`Upload failed`,
        message: t`Failed to upload attachment`,
        icon: "error",
      });
      setIsUploading(false);
    }
  };

  if (!attachments) return null;

  return (
    <div className="mt-8 border-t border-light-300 pt-8 dark:border-dark-300">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-light-1000 dark:text-dark-1000">
          {t`Attachments`}
        </h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 text-xs font-medium text-light-900 hover:text-light-1000 dark:text-dark-900 dark:hover:text-dark-1000"
        >
          <HiOutlinePaperClip className="h-4 w-4" />
          {isUploading ? t`Uploading...` : t`Add`}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          accept="image/*"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="group relative aspect-video overflow-hidden rounded-md border border-light-300 bg-light-100 dark:border-dark-300 dark:bg-dark-100"
          >
            <img
              src={attachment.url}
              alt={attachment.fileName}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => window.open(attachment.url, "_blank")}
                className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                title={t`Open`}
              >
                <HiOutlinePaperClip className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  setCoverImage.mutate({
                    cardPublicId,
                    attachmentPublicId:
                      attachment.id === coverAttachmentId
                        ? null
                        : attachment.publicId,
                  })
                }
                className={`rounded-full p-2 text-white hover:bg-white/20 ${attachment.id === coverAttachmentId ? "bg-green-500/80" : "bg-white/10"}`}
                title={
                  attachment.id === coverAttachmentId
                    ? t`Remove cover`
                    : t`Make cover`
                }
              >
                <HiPhoto className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  deleteAttachment.mutate({
                    cardPublicId,
                    attachmentPublicId: attachment.publicId,
                  })
                }
                className="rounded-full bg-white/10 p-2 text-white hover:bg-red-500/80"
                title={t`Delete`}
              >
                <HiTrash className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


