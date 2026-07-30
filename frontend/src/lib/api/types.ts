/** Shapes returned by the Folium API. These mirror the backend's Pydantic
 *  schemas exactly; renaming a field here does not rename it there. */

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentListResponse {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
}

/** A TipTap document node tree.
 *
 * Deliberately loose about its children: the backend's schema validates the
 * structure on every write, and restating that rule here would duplicate it
 * without enforcing anything. */
export interface TipTapDoc {
  type: "doc";
  content?: unknown[];
}

/** What the caller may do with a document. `owner` is not stored — the backend
 *  derives it by comparing owner_id to the caller. */
export type Permission = "owner" | "edit" | "comment" | "view";

export interface DocumentDetail extends DocumentSummary {
  content: TipTapDoc;
  permission: Permission;
  owner: UserProfile;
}
