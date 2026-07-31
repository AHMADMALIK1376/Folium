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
import { getVersion, listVersions, restoreVersion } from "@/lib/api/documents";
import type { TipTapDoc, VersionDetail, VersionSummary } from "@/lib/api/types";
import { relativeTime } from "@/lib/format/relativeTime";
import { cn } from "@/lib/utils";

/** Flatten a TipTap document to plain text for the preview.
 *
 * A preview, not a second editor: it exists so nobody restores blind, and
 * mounting a whole read-only TipTap instance to show a paragraph or two would
 * cost far more than it returns. Formatting is lost here and restored intact —
 * the JSON is what gets written back, not this text.
 */
function toPlainText(content: TipTapDoc | undefined): string {
  if (!content) return "";

  const walk = (node: unknown): string => {
    if (typeof node !== "object" || node === null) return "";
    const record = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof record.text === "string") return record.text;
    if (!Array.isArray(record.content)) return "";
    const inner = record.content.map(walk).join("");
    // Block nodes each end a line; inline marks do not.
    return record.type === "paragraph" || record.type?.startsWith("heading")
      ? `${inner}\n`
      : inner;
  };

  return (content.content ?? []).map(walk).join("").trim();
}

export function HistoryDialog({
  documentId,
  canEdit,
  onRestored,
}: {
  documentId: string;
  canEdit: boolean;
  onRestored: (content: TipTapDoc) => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setVersions(await listVersions(documentId));
    } catch (e) {
      setError(e);
    }
  }, [documentId]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const preview = async (versionId: string) => {
    setError(null);
    setBusy(true);
    try {
      setSelected(await getVersion(documentId, versionId));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!selected) return;
    setError(null);
    setBusy(true);
    try {
      const document = await restoreVersion(documentId, selected.id);
      onRestored(document.content);
      setOpen(false);
      setSelected(null);
    } catch (e) {
      setError(e);
      // The version or the document is gone. Leaving the vanished entry on
      // screen would invite a second attempt at something that cannot work.
      await reload();
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSelected(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Earlier drafts, saved automatically as the document is edited.
          </DialogDescription>
        </DialogHeader>

        {error != null && (
          <ApiErrorMessage
            error={error}
            notFoundMessage="That version is no longer available."
            fallback="Could not load the history. Try again."
          />
        )}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <ul className="grid max-h-80 gap-1 overflow-y-auto">
            {versions?.length === 0 && (
              <li className="rounded-lg border border-dashed border-neutral-200 p-4 text-sm text-neutral-500">
                No earlier versions yet. They appear here as you edit.
              </li>
            )}

            {versions?.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void preview(version.id)}
                  className={cn(
                    "w-full rounded-md border p-2 text-left text-sm transition-colors",
                    selected?.id === version.id
                      ? "border-carmine-500 bg-carmine-50"
                      : "border-neutral-200 hover:bg-neutral-50",
                  )}
                >
                  <span className="block font-medium text-neutral-900">
                    {/* Null when the author's account was deleted. */}
                    {version.author_name ?? "Unknown"}
                  </span>
                  <span className="block text-neutral-500">
                    {relativeTime(version.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0">
            {selected ? (
              <>
                <pre className="max-h-72 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm whitespace-pre-wrap text-neutral-800">
                  {toPlainText(selected.content) || "This version was empty."}
                </pre>
                {canEdit && (
                  <div className="mt-3 flex justify-end">
                    {/* Absent for a viewer: the backend 404s their restore, so
                        the button could only ever produce an error. */}
                    <Button onClick={restore} disabled={busy}>
                      {busy ? "Restoring…" : "Restore"}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                Select a version to preview it.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
