import { apiFetch } from "./client";
import type { DocumentDetail, TipTapDoc } from "./types";

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
