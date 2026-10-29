"use client";

import { useEffect, useState } from "react";

import { getPublishStatus } from "@/lib/api/documents";
import type { PublishStatus } from "@/lib/api/types";
import { useFeatures } from "@/lib/hooks/useFeatures";

/** "Last published <time> by <name>", for anyone who can open the document.
 *
 * Shown to viewers too: it says where the team's copy lives, which is exactly
 * what someone reading a design document wants to know.
 *
 * `refreshKey` lets the publish dialog's success re-read it.
 */
export function PublishedNote({
  documentId,
  refreshKey = 0,
}: {
  documentId: string;
  refreshKey?: number;
}) {
  const features = useFeatures();
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const enabled = features?.github_publish === true;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getPublishStatus(documentId).then(
      (s) => !cancelled && setStatus(s),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, documentId, refreshKey]);

  if (!enabled || !status?.is_published || !status.last_published_at) return null;

  const when = new Date(status.last_published_at).toLocaleString();
  const who = status.last_published_by ? ` by ${status.last_published_by.display_name}` : "";

  return (
    <p className="text-xs text-neutral-500">
      Last published {when}
      {who}
      {status.file_url && (
        <>
          {" · "}
          <a href={status.file_url} target="_blank" rel="noreferrer" className="underline">
            View in GitHub
          </a>
        </>
      )}
    </p>
  );
}
