"use client";

import type { Editor } from "@tiptap/react";
import { useRef, useState } from "react";

import { attachmentRawUrl, uploadAttachment } from "@/lib/api/documents";

/** Image types the backend accepts. Kept in step with CONTENT_TYPES in
 *  app/services/attachments.py — SVG is absent there deliberately, because it
 *  can carry script, and it is absent here for the same reason. */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

/** Insert an image into the document.
 *
 * The image is uploaded as an attachment of this document first, and the node
 * stores the attachment's stable raw URL. That URL redirects to a freshly
 * signed one on each request, so the document still renders next year — and a
 * reader who loses access to the document loses access to its images at the
 * same moment, which a public bucket would not have given us.
 */
export function ImageButton({
  editor,
  documentId,
}: {
  editor: Editor;
  documentId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so picking the same file twice still fires a change event.
    event.target.value = "";
    if (!file) return;

    setError(null);

    const dot = file.name.lastIndexOf(".");
    const extension = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(extension)) {
      setError(`${file.name} is not an image Folium can insert.`);
      return;
    }

    setBusy(true);
    try {
      const attachment = await uploadAttachment(documentId, file);
      editor
        .chain()
        .focus()
        .setImage({
          src: attachmentRawUrl(documentId, attachment.id),
          // Defaulted to the filename rather than left empty. An image with no
          // alt text is invisible to a screen reader, and an editor that makes
          // that the easy path makes its users' documents worse.
          alt: file.name,
        })
        .run();
    } catch {
      setError("Could not insert that image. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={IMAGE_EXTENSIONS.join(",")}
        onChange={onPick}
        data-testid="image-input"
      />
      <button
        type="button"
        aria-label="Insert image"
        title="Insert image"
        disabled={busy}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className={
          "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-1.5 text-sm transition-colors " +
          "text-neutral-600 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none " +
          (busy ? "opacity-50" : "")
        }
      >
        {busy ? "…" : "🖼"}
      </button>
      {error && (
        <span role="alert" className="shrink-0 text-xs text-carmine-700">
          {error}
        </span>
      )}
    </>
  );
}
