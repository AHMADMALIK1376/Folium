"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { DocumentSummary } from "@/lib/api/types";

export function DeleteDocumentDialog({ document }: { document: DocumentSummary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // router.refresh() returns void and settles asynchronously. Without a
  // transition the buttons re-enable the instant the DELETE resolves — while
  // the list on screen still shows the deleted document — so a second click
  // could land before the refreshed list arrives. isPending stays true until
  // the refreshed server payload has been applied.
  const [refreshing, startTransition] = useTransition();
  const busy = deleting || refreshing;

  const confirm = async () => {
    setError(null);
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/documents/${document.id}`, { method: "DELETE" });
    } catch (e) {
      // A 404 means it is already gone, which is what the user asked for.
      if (!(e instanceof ApiError && e.status === 404)) {
        // Kept as the raw error: an expired session needs a sign-in link, not
        // a "try again" that will 401 forever.
        setError(e);
        setDeleting(false);
        return;
      }
    }
    setDeleting(false);
    // The page is a Server Component, so refreshing re-runs its fetch rather
    // than keeping a second copy of the list in client state. Don't close the
    // dialog until the refresh is underway, and keep the buttons disabled
    // through it — see the busy comment above.
    startTransition(() => router.refresh());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{document.title}”?</DialogTitle>
          <DialogDescription>
            It moves to the trash, where you can restore it.
          </DialogDescription>
        </DialogHeader>
        {error != null && (
          <ApiErrorMessage
            error={error}
            fallback="Could not delete the document. Try again."
          />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          {/* carmine-700, not the brand carmine-500: a destructive action must
              not look like an ordinary primary button. */}
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Deleting…" : "Move to trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
