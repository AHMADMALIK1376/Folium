# Folium

A lightweight collaborative document editor (Google-Docs-inspired), built for the Ajaia AI-Native Full Stack Developer assignment.

Repo: https://github.com/AHMADMALIK1376/Folium

Live demo: see `SUBMISSION.md` for the deployed URL and seeded test accounts.

## What it does

- Create, rename, and edit rich-text documents in the browser (bold, italic, underline, headings, bulleted/numbered lists), with autosave.
- Import a `.txt` or `.md` file as a new document.
- Share a document with another (seeded) user; dashboard clearly separates "My Documents" from "Shared with Me".
- Everything persists to disk and survives a refresh or server restart.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**, single full-stack app (frontend + API routes together).
- **`node:sqlite`** (Node's built-in SQLite module) for persistence — no ORM, no external database service, no separate driver dependency. See `ARCHITECTURE.md` for why.
- **TipTap** for the rich-text editor.
- **Zod** for request validation.
- Hand-written CSS (no UI framework) — kept the dependency footprint small.
- Mocked auth: three seeded accounts, no passwords, cookie-based session. See `ARCHITECTURE.md` for the reasoning.

## Requirements

- **Node.js >= 22.5.0** (this project uses `node:sqlite`, which is a built-in module available from Node 22.5+ without a flag). Check with `node -v`.
- No external database, no API keys, no paid services required.

## Local setup

```bash
npm install
npm run dev
```

Then open http://localhost:3000. You'll land on a login screen with three seeded accounts — click any one to continue (see "Test accounts" below). The database file is created automatically at `data/app.sqlite` on first run, pre-seeded with a couple of example documents.

To reset all data, stop the server and delete `data/app.sqlite*`.

### Production build

```bash
npm run build
npm run start
```

### Tests

```bash
npm test
```

Runs Node's built-in test runner (`node --test`) against `test/*.test.ts`. Covers the document access-control logic (owner/shared/denied), request validation schemas, and the file-import markdown/text conversion.

## Test accounts

This app uses mocked auth (see `ARCHITECTURE.md`) — there's no sign-up flow. Pick any of these on the login screen to explore:

| Name | Email |
|---|---|
| Alice Chen | alice@example.com |
| Bob Martinez | bob@example.com |
| Carol Singh | carol@example.com |

Alice and Bob each start with one seeded document; Bob's "Q3 Roadmap" doc is pre-shared with Alice, so you can see the sharing UI immediately without setting anything up. To test sharing yourself: log in as one user, open a document you own, click **Share**, and enter another seeded account's email (e.g. `carol@example.com`).

## File upload

Supported file types: **`.txt` and `.md`/`.markdown` only**, max 2MB. This is enforced both in the UI (the file picker's `accept` filter) and on the server (the upload API rejects anything else with a clear error message).

- `.txt` files are split into paragraphs on blank lines.
- `.md` files go through a small, dependency-free converter that handles `#`/`##`/`###` headings, `**bold**`, `*italic*`, and `-`/numbered lists — the same formatting the editor itself supports. It is **not** a full CommonMark parser (no tables, code blocks, links, nested lists, etc.) — this was a deliberate scope cut given the assignment's editor only needs to support that same formatting subset. See `ARCHITECTURE.md`.

## Project structure

```
src/
  app/                 Next.js App Router pages + API routes
    api/                 REST-ish API endpoints (documents, sharing, upload, auth)
    dashboard/            Dashboard page
    documents/[id]/        Document editor page
    login/                Login page
  components/           React client components (editor, toolbar, share modal, etc.)
  lib/
    db.ts                 SQLite connection, schema migration, auto-seed
    repo.ts                Data access layer + access-control logic
    auth.ts                Cookie-based mocked session helpers
    validation.ts           Zod schemas
    importFile.ts            .txt/.md → HTML conversion for file import
test/                  node:test test suite
data/                  SQLite database file lives here (gitignored)
```

## Known limitations / what's out of scope

- **Auth is mocked.** No passwords, no real sign-up. Explicitly allowed by the assignment ("You may simulate users with seeded accounts, mocked auth, or a lightweight login flow").
- **Sharing is binary** (has access / doesn't) — no view-only vs. edit permission levels.
- **Markdown import is intentionally minimal** — headings, bold, italic, and lists only (matches the editor's own formatting support).
- **No real-time collaboration** (e.g. no live multi-cursor editing) — autosave + refresh-to-see-others'-changes only. Listed as a stretch goal in the assignment; deliberately deprioritized in favor of a solid core editing/sharing/persistence experience.
- **No document version history or trash/undo-delete.**

See `SUBMISSION.md` for the full "what's working / what's next" breakdown.
