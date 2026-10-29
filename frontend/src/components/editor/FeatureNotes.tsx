"use client";

import { useFeatures } from "@/lib/hooks/useFeatures";

const NOTE = "rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600";

/** Said only when the deployment is known to have live editing off.
 *
 * Without it two people can type into one document and the later save wins,
 * which nobody would guess from a screen that looks perfectly normal. Silent
 * when the answer is unknown: a warning about a feature we merely failed to ask
 * about would be a false alarm.
 */
export function CollaborationOffNote({ editable }: { editable: boolean }) {
  const features = useFeatures();

  if (!editable || features?.collaboration !== false) return null;

  return (
    <p role="note" data-print-hide className={NOTE}>
      Live editing is off — edits by two people at the same time can overwrite each other.
    </p>
  );
}

/** Takes the place of the attachments panel when the server has no storage.
 *
 * Driven by the document's own `attachments_enabled`, which the editor already
 * has, so it needs no request of its own.
 */
export function AttachmentsOffNote({ enabled }: { enabled: boolean }) {
  if (enabled) return null;

  return (
    <p role="note" data-print-hide className={NOTE}>
      Attachments are off — file storage is not set up on this server.
    </p>
  );
}
