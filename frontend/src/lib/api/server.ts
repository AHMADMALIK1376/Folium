import { createClient } from "@/lib/supabase/server";
import { ApiError } from "./errors";
import type { DocumentDetail, DocumentListResponse, DocumentSummary, Folder } from "./types";

/** Call the Folium API from a Server Component.
 *
 * The browser client reads its token from the Supabase browser session, which
 * does not exist on the server; this one reads it from cookies.
 *
 * It uses getSession(), not getUser(), and that is deliberate. Everywhere else
 * this project insists access decisions use getUser(), because getSession()
 * only decodes a cookie a client could have forged. This makes no access
 * decision: middleware has already authenticated the caller with getUser(),
 * and here we need only the raw token to forward. The backend then verifies
 * that token against Supabase's published keys before answering, so a forged
 * one gets a 401 from FastAPI rather than data. getUser() would cost a network
 * round-trip and return no token at all.
 */
export async function serverApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError(0, "Not signed in");
  }

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const response = await fetch(`${base}${path}`, {
    ...init,
    // Never cache: a Server Component renders per request, and a shared cache
    // would serve one user another user's documents.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.clone().json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Non-JSON error body. Keep the status text.
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return null as T;
  return (await response.clone().json()) as T;
}

export function getDocuments(): Promise<DocumentListResponse> {
  return serverApiFetch<DocumentListResponse>("/api/v1/documents");
}

export function getTrash(): Promise<DocumentSummary[]> {
  return serverApiFetch<DocumentSummary[]>("/api/v1/documents/trash");
}

/** Fetch one document, with its content and the caller's permission on it.
 *
 * Raises ApiError(404) both when the document does not exist and when the
 * caller may not see it — the backend conflates the two so the API cannot be
 * used to discover which documents exist. */
export function getDocument(id: string): Promise<DocumentDetail> {
  return serverApiFetch<DocumentDetail>(`/api/v1/documents/${id}`);
}

/** This person's starred documents, most recently starred first. */
export function getStarred(): Promise<DocumentSummary[]> {
  return serverApiFetch<DocumentSummary[]>("/api/v1/documents/starred");
}

/** This person's folders, with document counts.
 *
 * Called twice per dashboard render — the layout draws the rail, the page needs
 * the names for its heading and its per-document folder control — and that is
 * deliberate rather than overlooked. React's cache() would collapse them, but
 * it is a Server Component API that this React build does not export, so
 * relying on it takes every test in server.test.ts down at import time.
 *
 * The duplicate costs no wall-clock time: Next renders the layout and the page
 * concurrently, and the page runs its two fetches in a Promise.all, so all
 * three are in flight together.
 */
export function getFolders(): Promise<Folder[]> {
  return serverApiFetch<Folder[]>("/api/v1/folders");
}
