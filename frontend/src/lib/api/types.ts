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
  /** A template is a document with a flag on it, not a separate kind of thing:
   *  same editor, same list, same export. The flag only says "offer this when
   *  starting something new". */
  is_template: boolean;
  /** Null when unfiled. Only a document you own can be in a folder — folders
   *  are one person's organisation of their own work. */
  folder_id: string | null;
}

/** A folder, with how much is in it.
 *
 * Organisation, not access: filing a document changes nothing about who can
 * read it. The count excludes the trash. */
export interface Folder {
  id: string;
  name: string;
  created_at: string;
  document_count: number;
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

/** What an owner may grant.
 *
 * All three, as of Phase 14. "comment" was withheld for thirteen phases because
 * granting a capability that does not exist would have left the collaborator
 * with a document they could neither comment on nor edit. It exists now. */
export type GrantablePermission = "view" | "comment" | "edit";

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
  is_template: boolean;
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

/** A comment on a document, or on a passage inside it.
 *
 * The anchor is a text quote selector — `quote` plus a little of what surrounded
 * it — and never a mark in the document. A mark would be a content write, and
 * the whole point of the `comment` permission is someone who may not write the
 * content. A comment with no quote is about the document as a whole. */
export interface Comment {
  id: string;
  document_id: string;
  parent_id: string | null;
  body: string;
  quote: string | null;
  prefix: string | null;
  suffix: string | null;
  author_id: string | null;
  /** Null when the author's account was deleted — author_id is ON DELETE SET
   *  NULL, so a discussion outlives the account that took part in it. */
  author_name: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A root comment with its replies. Replies go one level deep and no further. */
export interface CommentThread extends Comment {
  replies: Comment[];
}

/** What a notification is about.
 *
 * Four kinds and no others — not edits, resolutions, deletions or filings, each
 * of which is either routine or already known to whoever did it. A list that
 * fills with things nobody wanted is one people stop reading. */
export type NotificationKind = "comment" | "reply" | "mention" | "share";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  document_id: string;
  /** Carried on the row so a bell listing ten notifications is not eleven
   *  requests. */
  document_title: string;
  comment_id: string | null;
  actor_id: string | null;
  /** Null when the actor's account was deleted — "someone commented" is still
   *  true after they are gone. */
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
}
