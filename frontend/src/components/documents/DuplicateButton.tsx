"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { duplicateDocument } from "@/lib/api/documents";
import { cn } from "@/lib/utils";

/** Copy a document into your own account.
 *
 * Offered on shared documents as well as your own, because anyone who can read
 * one can already export it as Markdown and import the file back — a worse copy
 * through more steps. The button does not grant anything; it removes the
 * detour.
 */
export function DuplicateButton({
  documentId,
  title,
}: {
  documentId: string;
  title: string;
}) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Copying attachments is not instant, and router.refresh() settles
  // asynchronously — without the transition the button re-enables while the
  // list on screen is still the old one, and a second click makes a second
  // copy.
  const [refreshing, startTransition] = useTransition();
  const busy = copying || refreshing;

  const duplicate = async () => {
    setFailed(false);
    setCopying(true);
    try {
      await duplicateDocument(documentId);
      startTransition(() => router.refresh());
    } catch {
      setFailed(true);
    } finally {
      setCopying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={duplicate}
      disabled={busy}
      // The title is in the accessible name because a row of identical
      // "Duplicate" buttons tells a screen reader nothing about which document
      // each one copies.
      aria-label={`Duplicate ${title}`}
      title={failed ? "Could not duplicate this document" : `Duplicate ${title}`}
      className={cn(
        "rounded-md px-2 py-1 text-sm transition-colors",
        "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none",
        "disabled:opacity-50",
        failed ? "text-carmine-700" : "text-neutral-600",
      )}
    >
      {busy ? "Copying…" : "Duplicate"}
    </button>
  );
}
