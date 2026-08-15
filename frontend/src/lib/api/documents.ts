import { apiFetch } from "./client";
import { ApiError } from "./errors";
import type {
  CollabSession,
  DocumentDetail,
  GrantablePermission,
  Share,
  TipTapDoc,
  VersionDetail,
  VersionSummary,
} from "./types";

/** A partial update. An omitted field means "leave it alone" — the backend
 *  treats null and absent differently, so never send a field you did not
 *  change. */
export interface DocumentPatch {
  title?: string;
  content?: TipTapDoc;
}

/** Save a document.
 *
 * `init` exists for the unload flush, which passes `keepalive: true` so the
 * request outlives the page being torn down. v1 used navigator.sendBeacon for
 * that, which cannot work here: sendBeacon sets no headers, and every request
 * to this API must carry a bearer token.
 */
export function updateDocument(
  id: string,
  patch: DocumentPatch,
  init: RequestInit = {},
): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/api/v1/documents/${id}`, {
    ...init,
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Who a document is shared with. Anyone who can view it may ask. */
export function listShares(id: string): Promise<Share[]> {
  return apiFetch<Share[]>(`/api/v1/documents/${id}/shares`);
}

/** Share with an existing account, by email.
 *
 * Owner only — the backend answers 404, not 403, for anyone else. A 422 means
 * the address has no Folium account, or is the owner's own; its `detail` is
 * written for the person reading it and should be shown as-is.
 *
 * Sharing again with someone who already has access updates their level rather
 * than failing, so the caller need not check first. */
export function createShare(
  id: string,
  email: string,
  permission: GrantablePermission,
): Promise<Share> {
  return apiFetch<Share>(`/api/v1/documents/${id}/shares`, {
    method: "POST",
    body: JSON.stringify({ email, permission }),
  });
}

export function updateShare(
  id: string,
  userId: string,
  permission: GrantablePermission,
): Promise<null> {
  return apiFetch<null>(`/api/v1/documents/${id}/shares/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ permission }),
  });
}

/** Revoke access. Idempotent: removing a share that is already gone succeeds. */
export function deleteShare(id: string, userId: string): Promise<null> {
  return apiFetch<null>(`/api/v1/documents/${id}/shares/${userId}`, {
    method: "DELETE",
  });
}

/** Upload a .txt or .md file as a new document.
 *
 * The backend owns the conversion to TipTap JSON — v1 converted to HTML in the
 * browser, which is no use now that content is JSON. No headers are set here:
 * apiFetch omits Content-Type for FormData so the browser can supply the
 * multipart boundary. */
export function importDocument(file: File): Promise<DocumentDetail> {
  const body = new FormData();
  // "file" is the name of the backend's File() parameter. Any other name is a
  // 422 with no useful message.
  body.append("file", file);

  return apiFetch<DocumentDetail>("/api/v1/documents/import", {
    method: "POST",
    body,
  });
}

/** A document's history, newest first.
 *
 * Without content — the backend omits it deliberately, since fifty entries
 * would otherwise mean fifty full documents. Anyone who can view the document
 * may list its history. */
export function listVersions(id: string): Promise<VersionSummary[]> {
  return apiFetch<VersionSummary[]>(`/api/v1/documents/${id}/versions`);
}

/** One version, with its content, for previewing before restoring. */
export function getVersion(id: string, versionId: string): Promise<VersionDetail> {
  return apiFetch<VersionDetail>(`/api/v1/documents/${id}/versions/${versionId}`);
}

/** Put the document back to an earlier state.
 *
 * Requires edit permission; a viewer gets a 404. Returns the updated document,
 * so the caller can hand the restored content straight to the editor rather
 * than re-fetching it. */
export function restoreVersion(
  id: string,
  versionId: string,
): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(
    `/api/v1/documents/${id}/versions/${versionId}/restore`,
    { method: "POST" },
  );
}

/** Authorise this browser for a document's collaboration room.
 *
 * POST rather than GET because it creates the room on first use. A 404 means
 * the document is not visible to this user; a 503 means the collaboration
 * server is down, which the caller should treat as "edit alone", not as an
 * error worth showing. */
export function getCollabSession(id: string): Promise<CollabSession> {
  return apiFetch<CollabSession>(`/api/v1/documents/${id}/collab`, {
    method: "POST",
  });
}

/** Download a document as Markdown.
 *
 * Does not go through apiFetch, which parses every response as JSON — this one
 * is a file. It repeats only the token read, and returns the body together with
 * the filename the server chose, so the browser saves it under the document's
 * own name rather than something invented here.
 */
export async function exportMarkdown(
  id: string,
): Promise<{ blob: Blob; filename: string }> {
  const { createClient } = await import("@/lib/supabase/client");
  const {
    data: { session },
  } = await createClient().auth.getSession();

  if (!session) throw new ApiError(0, "Not signed in");

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const response = await fetch(`${base}/api/v1/documents/${id}/export?format=markdown`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }

  return {
    blob: await response.blob(),
    filename: filenameFrom(response.headers.get("Content-Disposition")),
  };
}

/** Pull the filename out of a Content-Disposition header.
 *
 * The server sends it twice, as RFC 6266 requires: `filename*` in UTF-8, and a
 * plain ASCII `filename` for clients that do not understand the first. This
 * reads them in that order — taking the ASCII one first would save a document
 * titled in Urdu or Chinese as "document.md", since nothing of those titles
 * survives the fallback.
 */
function filenameFrom(header: string | null): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // Malformed percent-encoding. Fall through to the ASCII name.
    }
  }

  return header?.match(/filename="([^"]+)"/)?.[1] ?? "document.md";
}
