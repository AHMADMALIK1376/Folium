"use client";

import { useEffect, useState } from "react";

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
import { getPublishStatus, publishDocument } from "@/lib/api/documents";
import { ApiError } from "@/lib/api/errors";
import type { Permission, PublishResult, PublishStatus } from "@/lib/api/types";
import { lossyWarning } from "@/lib/editor/lossy";
import { useFeatures } from "@/lib/hooks/useFeatures";

/** Send the document to the team's GitHub repository as a Markdown file.
 *
 * Absent for anyone who cannot edit, and absent when the deployment has no
 * GitHub token. Both are decided again by the backend; hiding the button is a
 * courtesy, not the control.
 */
export function PublishDialog({
  documentId,
  permission,
  content,
  onPublished,
}: {
  documentId: string;
  permission: Permission;
  /** The document as it stands, for warning about formatting Markdown drops. */
  content?: unknown;
  /** Lets the page refresh its "last published" line. */
  onPublished?: () => void;
}) {
  const features = useFeatures();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);

  const allowed =
    (permission === "owner" || permission === "edit") && features?.github_publish === true;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setConflict(false);
    setResult(null);
    getPublishStatus(documentId).then(
      (s) => {
        if (cancelled) return;
        setStatus(s);
        setPath(s.path);
      },
      (e) => !cancelled && setError(e),
    );
    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  if (!allowed) return null;

  const warning = lossyWarning(content);

  const run = async (overwrite: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const published = await publishDocument(documentId, path.trim(), overwrite);
      setConflict(false);
      setResult(published);
      setPath(published.path);
      onPublished?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
      } else {
        setError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Publish to GitHub
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish to GitHub</DialogTitle>
          <DialogDescription>
            {status?.repo
              ? `Saves this document as a Markdown file in ${status.repo} (${status.branch}).`
              : "Saves this document as a Markdown file in the team repository."}
          </DialogDescription>
        </DialogHeader>

        {error != null && (
          <ApiErrorMessage
            error={error}
            notFoundMessage="This document is no longer available."
            detailStatuses={[422, 502, 504]}
            fallback="Could not publish the document. Try again."
          />
        )}

        {warning && (
          <p
            role="note"
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {warning}
          </p>
        )}

        {conflict && (
          <div
            role="alert"
            className="grid gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          >
            <p>This file was changed in GitHub since the last publish.</p>
            <p>Overwriting replaces those changes with this version of the document.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConflict(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy} onClick={() => run(true)}>
                Overwrite
              </Button>
            </div>
          </div>
        )}

        {result ? (
          <div role="status" className="grid gap-1 text-sm">
            <p className="font-medium text-neutral-900">Published to {result.path}.</p>
            <a
              href={result.commit_url}
              target="_blank"
              rel="noreferrer"
              className="text-carmine-500 underline"
            >
              View commit
            </a>
          </div>
        ) : (
          <>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-neutral-900">File path in the repository</span>
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="docs/tech-stack.md"
                spellCheck={false}
                dir="auto"
              />
            </label>

            {status?.is_published && status.last_published_at && (
              <p className="text-sm text-neutral-500">
                Last published {new Date(status.last_published_at).toLocaleString()}
                {status.last_published_by ? ` by ${status.last_published_by.display_name}` : ""}.
                Changing the path publishes to a new file; the old one stays in the repository.
              </p>
            )}

            <p className="text-sm text-neutral-500">
              This publishes a snapshot. Edits you make afterwards reach GitHub only when someone
              publishes again.
            </p>

            <Button
              onClick={() => run(false)}
              disabled={busy || !status || path.trim() === "" || conflict}
            >
              {busy ? "Publishing…" : "Publish"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
