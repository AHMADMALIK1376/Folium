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

/** A search hit: the document, plus why it matched.
 *
 * The snippet is the point — a list of titles does not say what was found, and
 * "Untitled document" three times over is not an answer. */
export interface SearchResult extends DocumentSummary {
  snippet: string;
  owned: boolean;
}

export interface SearchResults {
  query: string;
  results: SearchResult[];
}

/** A document in a list, with whether this person starred it.
 *
 * Carried on the list rather than fetched separately: the dashboard used to
 * make a second authenticated call for stars, and each one costs a database
 * round trip of roughly half a second against a hosted Postgres. */
export interface DocumentListItem extends DocumentSummary {
  starred: boolean;
}

export interface DocumentListResponse {
  owned: DocumentListItem[];
  shared: DocumentListItem[];
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

/** One run of text in a diff, and what happened to it. */
export interface DiffSegment {
  op: "equal" | "added" | "removed";
  text: string;
}

/** What changed between a version and the document as it stands.
 *
 * The counts answer the question most of the time — "12 words added, 4
 * removed" is usually the whole answer — and the segments are for when it is
 * not. */
export interface VersionDiff {
  added: number;
  removed: number;
  segments: DiffSegment[];
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
  /** False when the deployment has no Supabase service-role key configured — a
   *  supported state, not a failure, exactly as CollabSession.enabled is. The
   *  editor then omits the attachments panel rather than offering a control
   *  that would 503. */
  attachments_enabled: boolean;
}

/** A file attached to a document.
 *
 * Deliberately without a storage path: that is an address inside a private
 * bucket, and the browser reaches the bytes through a short-lived signed URL
 * from `GET .../attachments/{id}/url` instead. */
export interface Attachment {
  id: string;
  document_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface AttachmentUrl {
  url: string;
  expires_in: number;
}

/** What a client needs to join a document's collaboration room.
 *
 * `enabled` is false when the deployment has no y-sweet configured — a
 * supported state, not a failure. The editor then behaves exactly as it did
 * before Phase 4: local editing with autosave. */
export interface CollabUser {
  id: string;
  email: string;
  display_name: string;
}

export interface CollabSession {
  enabled: boolean;
  url: string | null;
  base_url: string | null;
  doc_id: string | null;
  token: string | null;
  permission: Permission;
  /** The caller — whoever is signed in — not the document's owner. Cursor
   *  labels come from here. */
  user: CollabUser;
}
