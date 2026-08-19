"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createShare,
  deleteShare,
  listShares,
  updateShare,
} from "@/lib/api/documents";
import { ApiError } from "@/lib/api/errors";
import type { GrantablePermission, Share } from "@/lib/api/types";

/** How each stored level reads to a person. */
const LABELS: Record<string, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
};

/** All three, as of Phase 14. "comment" was withheld for thirteen phases
 *  because it did nothing: granting it would have handed someone a document
 *  they could neither comment on nor edit. */
const GRANTABLE: GrantablePermission[] = ["view", "comment", "edit"];

function permissionLabel(permission: string) {
  return LABELS[permission] ?? permission;
}

/** Manage who a document is shared with. Rendered by the editor for owners
 *  only — the backend answers 404 to share mutations from anyone else, so an
 *  editor given this dialog could only ever collect errors. */
export function ShareDialog({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<GrantablePermission>("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setShares(await listShares(documentId));
    } catch (e) {
      setError(e);
    }
  }, [documentId]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  /** Run a mutation, then re-read the list.
   *
   * Re-reading rather than patching local state: the list is small, the server
   * owns it, and an owner with two tabs open should not see them disagree. */
  const mutate = useCallback(
    async (action: () => Promise<unknown>, { tolerate404 = false } = {}) => {
      setError(null);
      setBusy(true);
      try {
        await action();
      } catch (e) {
        // A 404 on removal means it is already gone, which is what was asked
        // for. A 404 on anything else means the document itself vanished.
        if (!(tolerate404 && e instanceof ApiError && e.status === 404)) {
          setError(e);
          setBusy(false);
          return;
        }
      }
      await reload();
      setBusy(false);
    },
    [reload],
  );

  const add = () => {
    if (email.trim() === "") return;
    void mutate(async () => {
      await createShare(documentId, email.trim(), permission);
      setEmail("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this document</DialogTitle>
          <DialogDescription>
            The person you share with needs a Folium account already.
          </DialogDescription>
        </DialogHeader>

        {error != null && (
          <ApiErrorMessage
            error={error}
            // 422 carries the backend's own wording — "No user with that email",
            // "You already own this document" — both specific and actionable.
            detailStatuses={[422]}
            notFoundMessage="This document is no longer available."
            fallback="Could not update sharing. Try again."
          />
        )}

        <ul className="grid gap-2">
          {shares?.length === 0 && (
            <li className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-500">
              Not shared with anyone yet.
            </li>
          )}

          {shares?.map((share) => (
            <li
              key={share.user_id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {share.display_name}
                </p>
                <p className="truncate text-sm text-neutral-500">{share.email}</p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <label className="sr-only" htmlFor={`permission-${share.user_id}`}>
                  Permission for {share.display_name}
                </label>
                <select
                  id={`permission-${share.user_id}`}
                  value={GRANTABLE.includes(share.permission as GrantablePermission)
                    ? share.permission
                    : ""}
                  disabled={busy}
                  onChange={(event) =>
                    void mutate(() =>
                      updateShare(
                        documentId,
                        share.user_id,
                        event.target.value as GrantablePermission,
                      ),
                    )
                  }
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-700"
                >
                  {/* A level this dialog cannot grant still has to be shown, or
                      the select would silently misreport their access. */}
                  {!GRANTABLE.includes(share.permission as GrantablePermission) && (
                    <option value="" disabled>
                      {permissionLabel(share.permission)}
                    </option>
                  )}
                  {GRANTABLE.map((value) => (
                    <option key={value} value={value}>
                      {permissionLabel(value)}
                    </option>
                  ))}
                </select>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Remove ${share.display_name}`}
                  onClick={() =>
                    void mutate(() => deleteShare(documentId, share.user_id), {
                      tolerate404: true,
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Label htmlFor="share-email">Email</Label>
          {/* Stacked below sm. Side by side on a 375px screen, the permission
              select and the Share button left the email field about 100px wide
              — enough to show "colleague@" and no more. It did not overflow,
              which is why only looking at it caught this. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="share-email"
              type="email"
              value={email}
              placeholder="colleague@example.com"
              onChange={(event) => setEmail(event.target.value)}
              className="min-w-0 flex-1"
            />
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="new-share-permission">
                Permission for the new collaborator
              </label>
              <select
                id="new-share-permission"
                value={permission}
                onChange={(event) =>
                  setPermission(event.target.value as GrantablePermission)
                }
                className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-700 sm:flex-none"
              >
                {GRANTABLE.map((value) => (
                  <option key={value} value={value}>
                    {permissionLabel(value)}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={busy}>
                Share
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
