"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import {
  attachmentUrl,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
} from "@/lib/api/documents";
import type { Attachment } from "@/lib/api/types";

/** Kept in step with `CONTENT_TYPES` in app/services/attachments.py.
 *
 * The browser check is a courtesy, not a control: it turns a doomed 10MB upload
 * into an instant message. The backend refuses the same things again, and that
 * is the one that counts. */
const ALLOWED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
];

const MAX_BYTES = 10 * 1024 * 1024;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** Files attached to a document.
 *
 * A panel rather than a dialog, deliberately: attachments are part of the
 * document rather than an action performed on it, and hiding them behind a
 * button would conceal the one thing whose whole purpose is to be seen.
 */
export function AttachmentsPanel({
  documentId,
  canEdit,
}: {
  documentId: string;
  canEdit: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setAttachments(await listAttachments(documentId));
    } catch (e) {
      setError(e);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared immediately so picking the same file twice in a row still fires a
    // change event — otherwise a failed upload cannot be retried by reselecting.
    event.target.value = "";
    if (!file) return;

    setError(null);

    if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
      setError(new Error(`${file.name} is not a file type Folium can attach.`));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(new Error("Attachments are limited to 10MB."));
      return;
    }

    setBusy(true);
    try {
      const created = await uploadAttachment(documentId, file);
      setAttachments((current) => [...(current ?? []), created]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (attachment: Attachment) => {
    setError(null);
    try {
      // Minted now rather than held with the list: signed URLs expire, and one
      // issued when the editor opened would be dead by the time it was used.
      const { url } = await attachmentUrl(documentId, attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e);
    }
  };

  const onRemove = async (attachment: Attachment) => {
    setError(null);
    try {
      await deleteAttachment(documentId, attachment.id);
      setAttachments((current) =>
        (current ?? []).filter((a) => a.id !== attachment.id),
      );
    } catch (e) {
      setError(e);
    }
  };

  return (
    <section
      data-print-hide
      aria-labelledby="attachments-heading"
      className="border-t border-neutral-200 px-6 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="attachments-heading"
          className="text-sm font-semibold text-neutral-900"
        >
          Attachments
        </h2>

        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={ALLOWED_EXTENSIONS.join(",")}
              onChange={onPick}
              data-testid="attachment-input"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Uploading…" : "Attach a file"}
            </Button>
          </>
        )}
      </div>

      {error != null && (
        <div className="mt-3">
          <ApiErrorMessage
            error={error}
            notFoundMessage="That file is no longer attached."
            fallback={
              error instanceof Error && !("status" in error)
                ? error.message
                : "Could not load the attachments. Try again."
            }
          />
        </div>
      )}

      {attachments != null && attachments.length === 0 && (
        <p className="mt-3 text-sm text-neutral-500">
          {canEdit
            ? "Nothing attached yet."
            : "Nothing is attached to this document."}
        </p>
      )}

      {attachments != null && attachments.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center gap-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">
                {attachment.filename}
              </span>
              <span className="text-xs text-neutral-500">
                {formatSize(attachment.size_bytes)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(attachment)}
              >
                Download
              </Button>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRemove(attachment)}
                  aria-label={`Remove ${attachment.filename}`}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
