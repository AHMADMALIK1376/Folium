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

/** What an owner may grant today.
 *
 * The backend also accepts "comment", but commenting is not built, so granting
 * it would promise a capability that does not exist — the collaborator would
 * find a document they can neither comment on nor edit. An existing comment
 * share is still displayed faithfully; see Permission. */
export type GrantablePermission = "view" | "edit";

export interface Share {
  user_id: string;
  email: string;
  display_name: string;
  /** Not narrowed to Permission: the column is a string, and a value this
   *  client does not recognise must display as-is rather than crash. */
  permission: string;
  created_at: string;
}

export interface VersionSummary {
  id: string;
  created_at: string;
  created_by: string | null;
  /** Null when the author's account was deleted — created_by is ON DELETE SET
   *  NULL, so history outlives the account that wrote it. Render "Unknown". */
  author_name: string | null;
}

/** One version with its content. The list deliberately omits content, so this
 *  is the only way to see what a version actually holds. */
export interface VersionDetail extends VersionSummary {
  content: TipTapDoc;
}

export interface DocumentDetail extends DocumentSummary {
  content: TipTapDoc;
  permission: Permission;
  owner: UserProfile;
}

/** What a client needs to join a document's collaboration room.
 *
 * `enabled` is false when the deployment has no y-sweet configured — a
 * supported state, not a failure. The editor then behaves exactly as it did
 * before Phase 4: local editing with autosave. */
export interface CollabSession {
  enabled: boolean;
  url: string | null;
  base_url: string | null;
  doc_id: string | null;
  token: string | null;
  permission: Permission;
}
