// Data access layer. Kept as plain functions (no class/ORM ceremony) so the
// access-control logic in `canAccessDocument` can be unit tested in isolation
// without spinning up Next.js or hitting the real database.
import { db, newId } from "./db.ts";
import type { DocumentRow, DocumentWithMeta, User } from "./types.ts";

export function getAllUsers(): User[] {
  return db.prepare("SELECT * FROM users ORDER BY name").all() as unknown as User[];
}

export function getUserById(id: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return db
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .get(email) as User | undefined;
}

export function getDocumentRow(id: string): DocumentRow | undefined {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as
    | DocumentRow
    | undefined;
}

export function getShareUserIds(documentId: string): string[] {
  const rows = db
    .prepare("SELECT user_id FROM document_shares WHERE document_id = ?")
    .all(documentId) as { user_id: string }[];
  return rows.map((r) => r.user_id);
}

/**
 * Pure access-control check: is `userId` allowed to view/edit this document?
 * Owners always have access; anyone in `sharedUserIds` has access.
 * Kept dependency-free (no DB calls) so it's trivially unit-testable.
 */
export function canAccessDocument(
  doc: Pick<DocumentRow, "owner_id">,
  userId: string,
  sharedUserIds: string[]
): boolean {
  if (!userId) return false;
  if (doc.owner_id === userId) return true;
  return sharedUserIds.includes(userId);
}

export function listDocumentsForUser(userId: string): {
  owned: DocumentWithMeta[];
  shared: DocumentWithMeta[];
} {
  const owned = db
    .prepare(
      `SELECT d.*, u.name as owner_name, u.email as owner_email
       FROM documents d JOIN users u ON u.id = d.owner_id
       WHERE d.owner_id = ?
       ORDER BY d.updated_at DESC`
    )
    .all(userId) as (DocumentRow & { owner_name: string; owner_email: string })[];

  const shared = db
    .prepare(
      `SELECT d.*, u.name as owner_name, u.email as owner_email
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       JOIN document_shares s ON s.document_id = d.id
       WHERE s.user_id = ?
       ORDER BY d.updated_at DESC`
    )
    .all(userId) as (DocumentRow & { owner_name: string; owner_email: string })[];

  return {
    owned: owned.map((d) => ({ ...d, is_owner: true })),
    shared: shared.map((d) => ({ ...d, is_owner: false })),
  };
}

export function getDocumentWithMeta(
  id: string,
  requestingUserId: string
): DocumentWithMeta | null {
  const doc = getDocumentRow(id);
  if (!doc) return null;
  const sharedUserIds = getShareUserIds(id);
  if (!canAccessDocument(doc, requestingUserId, sharedUserIds)) return null;

  const owner = getUserById(doc.owner_id);
  const sharedWith = sharedUserIds
    .map((uid) => getUserById(uid))
    .filter((u): u is User => Boolean(u))
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  return {
    ...doc,
    owner_name: owner?.name ?? "Unknown",
    owner_email: owner?.email ?? "",
    is_owner: doc.owner_id === requestingUserId,
    shared_with: sharedWith,
  };
}

export function createDocument(ownerId: string, title: string, content = ""): DocumentRow {
  const id = newId("doc");
  db.prepare(
    "INSERT INTO documents (id, title, content, owner_id) VALUES (?, ?, ?, ?)"
  ).run(id, title, content, ownerId);
  return getDocumentRow(id)!;
}

export function updateDocument(
  id: string,
  updates: { title?: string; content?: string }
): DocumentRow | undefined {
  const existing = getDocumentRow(id);
  if (!existing) return undefined;
  const title = updates.title ?? existing.title;
  const content = updates.content ?? existing.content;
  db.prepare(
    "UPDATE documents SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, content, id);
  return getDocumentRow(id);
}

export function deleteDocument(id: string): void {
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

export function shareDocument(documentId: string, userId: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO document_shares (id, document_id, user_id) VALUES (?, ?, ?)"
  ).run(newId("share"), documentId, userId);
}

export function unshareDocument(documentId: string, userId: string): void {
  db.prepare(
    "DELETE FROM document_shares WHERE document_id = ? AND user_id = ?"
  ).run(documentId, userId);
}

export function addAttachment(
  documentId: string,
  filename: string,
  mimeType: string,
  data: Buffer
): string {
  const id = newId("att");
  db.prepare(
    "INSERT INTO attachments (id, document_id, filename, mime_type, size_bytes, data) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, documentId, filename, mimeType, data.byteLength, data);
  return id;
}
