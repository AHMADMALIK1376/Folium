import { apiFetch } from "./client";
import type {
  DocumentDetail,
  GrantablePermission,
  Share,
  TipTapDoc,
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
