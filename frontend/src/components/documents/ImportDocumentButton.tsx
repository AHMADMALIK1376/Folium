"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { buttonVariants } from "@/components/ui/button";
import { importDocument } from "@/lib/api/documents";
import { cn } from "@/lib/utils";

/** The backend's limits, mirrored so a rejection is instant and specific.
 *
 * The server enforces these too — a client check is a courtesy, never the
 * boundary. Both must stay in step with `app/api/v1/uploads.py`. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const ACCEPTED = [".txt", ".md", ".markdown"];

function rejectReason(file: File): string | null {
  // Lowercased, because the backend lowercases the suffix too: NOTES.MD is
  // valid, and a case-sensitive check here would refuse a file the server
  // accepts.
  const name = file.name.toLowerCase();
  if (!ACCEPTED.some((suffix) => name.endsWith(suffix))) {
    return "Only .txt and .md files can be imported.";
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return "That file is larger than the 2MB limit.";
  }
  return null;
}

export function ImportDocumentButton() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  // Kept apart from `error`: this is text written here for this user, whereas
  // `error` is an API failure whose wording ApiErrorMessage decides. Sharing one
  // slot meant sniffing the error's shape to guess which it was, and leaked raw
  // messages like "Failed to fetch" into the UI.
  const [rejection, setRejection] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  // router.push is fire-and-forget, so without a transition the control
  // re-enables while the browser is still navigating — the same trap
  // CreateDocumentButton documents for router.refresh().
  const [navigating, startTransition] = useTransition();
  const busy = uploading || navigating;

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clearing the value matters: choosing the same file twice in a row fires no
    // change event otherwise, so retrying after a failure looks broken.
    event.target.value = "";
    if (!file) return;

    setRejection(null);
    setError(null);

    const reason = rejectReason(file);
    if (reason) {
      setRejection(reason);
      return;
    }

    setUploading(true);
    try {
      const created = await importDocument(file);
      // Straight into the document: unlike a blank new one, an imported file has
      // content the user wants to see.
      startTransition(() => router.push(`/documents/${created.id}`));
    } catch (e) {
      setError(e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {rejection && <AuthMessage kind="error">{rejection}</AuthMessage>}

      {error != null && (
        <ApiErrorMessage
          error={error}
          // 422 is where the backend explains a rejected file — "File must be
          // UTF-8 encoded text" is worth showing verbatim.
          detailStatuses={[422]}
          fallback="Could not import that file. Try again."
        />
      )}

      {/* A styled label around a real file input: it looks like the button
          beside it while staying a genuine input, so it is keyboard-reachable
          and announces itself. A div with an onClick would be neither. */}
      <label
        className={cn(
          buttonVariants({ variant: "outline" }),
          "cursor-pointer",
          busy && "pointer-events-none opacity-50",
        )}
      >
        {busy ? "Importing…" : "Import file"}
        <input
          type="file"
          accept={ACCEPTED.join(",")}
          aria-label="Import a .txt or .md file"
          disabled={busy}
          onChange={onChange}
          className="sr-only"
        />
      </label>
    </div>
  );
}
