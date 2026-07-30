"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import type { DocumentSummary } from "@/lib/api/types";

export function CreateDocumentButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // router.refresh() returns void and settles asynchronously. Without a
  // transition the button re-enables the instant the POST resolves — while the
  // list on screen is still the old one — so a second click lands before the
  // new document ever appears and creates a duplicate. isPending stays true
  // until the refreshed server payload has been applied.
  const [refreshing, startTransition] = useTransition();
  const busy = creating || refreshing;

  const create = async () => {
    setError(null);
    setCreating(true);
    try {
      await apiFetch<DocumentSummary>("/api/v1/documents", {
        method: "POST",
        body: JSON.stringify({ title: "Untitled document" }),
      });
      // The page is a Server Component, so refreshing re-runs its fetch rather
      // than keeping a second copy of the list in client state.
      startTransition(() => router.refresh());
    } catch (e) {
      // Kept as the raw error: an expired session needs a sign-in link, not a
      // "try again" that will 401 forever.
      setError(e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {error != null && (
        <ApiErrorMessage
          error={error}
          fallback="Could not create the document. Try again."
        />
      )}
      <Button onClick={create} disabled={busy}>
        {busy ? "Creating…" : "New document"}
      </Button>
    </div>
  );
}
