"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { fileDocument } from "@/lib/api/documents";
import type { Folder } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** File a document into a folder, from its card.
 *
 * A native select on purpose. It is keyboard- and screen-reader-correct with
 * no popover code, and on a phone it opens the platform picker rather than a
 * menu that has to be scrolled inside a card.
 *
 * Rendered only for documents you own. A shared document is not yours to file,
 * and the backend refuses it — offering the control would be a lie.
 */
export function FolderSelect({
  documentId,
  folderId,
  folders,
}: {
  documentId: string;
  folderId: string | null;
  folders: Folder[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(folderId ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Nowhere to file it: the sidebar is where folders get made.
  if (folders.length === 0) return null;

  const change = async (next: string) => {
    const previous = value;
    setValue(next);
    setBusy(true);
    setFailed(false);
    try {
      await fileDocument(documentId, next === "" ? null : next);
      // So the folder counts and any active filter reflect this.
      router.refresh();
    } catch {
      setValue(previous);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      value={value}
      disabled={busy}
      onChange={(event) => void change(event.target.value)}
      aria-label="Folder"
      title={failed ? "Could not move the document" : "Folder"}
      className={cn(
        // The card stacks below sm, so this gets its own row on a phone and does
        // not have to be squeezed to leave the title something.
        "h-7 max-w-[9rem] shrink-0 truncate rounded-md border border-neutral-200 bg-white px-1.5 text-xs text-neutral-600",
        "transition-colors hover:border-neutral-300 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none",
        "disabled:opacity-60",
        failed && "border-carmine-500 text-carmine-700",
      )}
    >
      <option value="">No folder</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.name}
        </option>
      ))}
    </select>
  );
}
