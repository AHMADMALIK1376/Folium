"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import type { DocumentSummary } from "@/lib/api/types";

export function RestoreDocumentButton({ document }: { document: DocumentSummary }) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // router.refresh() returns void and settles asynchronously. Without a
  // transition the button re-enables the instant the POST resolves — while the
  // row on screen is still listed as deleted — so a second click lands before
  // the refreshed list arrives. isPending stays true until the refreshed server
  // payload has been applied.
  const [refreshing, startTransition] = useTransition();
  const busy = restoring || refreshing;

  const restore = async () => {
    setError(null);
    setRestoring(true);
    try {
      await apiFetch(`/api/v1/documents/${document.id}/restore`, { method: "POST" });
      // The page is a Server Component, so refreshing re-runs its fetch rather
      // than keeping a second copy of the list in client state.
      startTransition(() => router.refresh());
    } catch (e) {
      // Kept as the raw error: an expired session needs a sign-in link, not a
      // "try again" that will 401 forever.
      setError(e);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {error != null && (
        <ApiErrorMessage
          error={error}
          fallback="Could not restore the document. Try again."
        />
      )}
      <Button variant="ghost" size="sm" onClick={restore} disabled={busy}>
        {busy ? "Restoring…" : "Restore"}
      </Button>
    </div>
  );
}
