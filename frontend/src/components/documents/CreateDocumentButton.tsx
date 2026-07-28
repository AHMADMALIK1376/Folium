"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import type { DocumentSummary } from "@/lib/api/types";

export function CreateDocumentButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.refresh();
    } catch {
      setError("Could not create the document. Try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {error && <AuthMessage kind="error">{error}</AuthMessage>}
      <Button onClick={create} disabled={creating}>
        {creating ? "Creating…" : "New document"}
      </Button>
    </div>
  );
}
