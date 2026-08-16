"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setStarred } from "@/lib/api/documents";
import { cn } from "@/lib/utils";

/** Star or unstar a document.
 *
 * Optimistic: the star fills the moment it is clicked and reverts if the
 * request fails. A star is a bookmark — waiting a round trip to see whether it
 * took is more disruptive than the rare failure it would report, and the
 * failure is visible because the star goes back.
 */
export function StarButton({
  documentId,
  starred: initial,
}: {
  documentId: string;
  starred: boolean;
}) {
  const router = useRouter();
  const [starred, setStarredState] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !starred;
    setStarredState(next);
    setBusy(true);

    try {
      await setStarred(documentId, next);
      // So the Starred page reflects this without a manual reload.
      router.refresh();
    } catch {
      setStarredState(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={starred}
      aria-label={starred ? "Remove star" : "Star this document"}
      title={starred ? "Remove star" : "Star this document"}
      className={cn(
        "rounded-md px-2 py-1 text-base leading-none transition-colors",
        "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none",
        starred ? "text-amber-500" : "text-neutral-300 hover:text-neutral-400",
      )}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}
