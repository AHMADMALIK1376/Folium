// Persistence layer.
//
// Uses Node's built-in `node:sqlite` module (stable/experimental in Node 22+)
// instead of a third-party driver. This was a deliberate choice made mid-build:
// Prisma's native query-engine binary is fetched from a third-party CDN at
// install time, and that download is blocked in the environment this project
// was built in. node:sqlite ships with Node itself, needs zero extra
// dependencies, and is more than sufficient for this project's scope.
// See ARCHITECTURE.md for the full tradeoff writeup.
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "app.sqlite");

// Reuse a single connection across hot-reloads in dev.
const globalForDb = globalThis as unknown as { __docsapp_db?: DatabaseSync };

function createConnection(): DatabaseSync {
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export const db: DatabaseSync = globalForDb.__docsapp_db ?? createConnection();
if (!globalForDb.__docsapp_db) globalForDb.__docsapp_db = db;

// node:sqlite's StatementSync.get()/.all() return rows as null-prototype
// objects. That's fine for internal use, but Next.js's Server->Client
// Component serialization explicitly rejects null-prototype objects
// ("Only plain objects... can be passed to Client Components"). Since
// these rows eventually flow into client components (TopBar, DocumentCard,
// etc.), normalize every row to a plain object right at the source instead
// of patching every call site.
function toPlainObject<T>(row: T): T {
  if (row && typeof row === "object") return { ...(row as object) } as T;
  return row;
}

const rawPrepare = db.prepare.bind(db);
db.prepare = ((sql: string) => {
  const stmt = rawPrepare(sql);
  const rawGet = stmt.get.bind(stmt);
  const rawAll = stmt.all.bind(stmt);
  stmt.get = ((...args: unknown[]) => toPlainObject(rawGet(...args))) as typeof stmt.get;
  stmt.all = ((...args: unknown[]) =>
    (rawAll(...args) as unknown[]).map(toPlainObject)) as typeof stmt.all;
  return stmt;
}) as typeof db.prepare;

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_shares (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(document_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
    CREATE INDEX IF NOT EXISTS idx_shares_doc ON document_shares(document_id);
    CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
  `);
}

function seed() {
  const count = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  if (count.c > 0) return;

  const users = [
    { id: "user_alice", name: "Alice Chen", email: "alice@example.com" },
    { id: "user_bob", name: "Bob Martinez", email: "bob@example.com" },
    { id: "user_carol", name: "Carol Singh", email: "carol@example.com" },
  ];
  const insertUser = db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
  for (const u of users) insertUser.run(u.id, u.name, u.email);

  const insertDoc = db.prepare(
    "INSERT INTO documents (id, title, content, owner_id) VALUES (?, ?, ?, ?)"
  );
  const welcomeContent = `<h1>Welcome to Folium</h1><p>This is a lightweight collaborative document editor. Try <strong>bold</strong>, <em>italic</em>, and <u>underline</u> formatting, or add a list:</p><ul><li>Create a document</li><li>Share it with a teammate</li><li>Upload a .txt or .md file to import it</li></ul><p>Edits save automatically a moment after you stop typing.</p>`;
  insertDoc.run("doc_welcome", "Welcome to Folium", welcomeContent, "user_alice");

  const roadmapContent = `<h2>Q3 Roadmap Draft</h2><p>Rough notes, not final.</p><ol><li>Ship the editor MVP</li><li>Add sharing</li><li>Gather feedback</li></ol>`;
  insertDoc.run("doc_roadmap", "Q3 Roadmap (Draft)", roadmapContent, "user_bob");

  // Alice shares the roadmap doc with... wait, roadmap is owned by Bob, shared to Alice.
  const insertShare = db.prepare(
    "INSERT INTO document_shares (id, document_id, user_id) VALUES (?, ?, ?)"
  );
  insertShare.run(newId("share"), "doc_roadmap", "user_alice");
}

migrate();
seed();
