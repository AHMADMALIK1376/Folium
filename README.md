# Folium

A collaborative document editor — create, format, and edit rich-text documents in the browser, and
share them with other people.

> **Status: rebuilding for production.**
> Folium began as a timeboxed interview assignment and is now being rebuilt as a real product.
> The code currently in this repository is **v1** (a single Next.js app with local SQLite and mocked
> auth). The v2 architecture is designed and approved but **not yet implemented** — see
> [the foundation design spec](docs/superpowers/specs/2026-07-25-folium-foundation-design.md).

---

## Where things stand

| | v1 (in this repo today) | v2 (designed, being built) |
|---|---|---|
| Architecture | One Next.js app, frontend + API together | Separate Next.js frontend and FastAPI backend |
| Auth | Mocked — 3 seeded accounts, no passwords | Real sign-up via Supabase Auth |
| Database | Local SQLite file | PostgreSQL on Supabase |
| Content storage | HTML string | TipTap JSON |
| Sharing | Binary — has access or doesn't | View / comment / edit permissions |
| Collaboration | Autosave, refresh to see others' edits | Live multi-cursor editing |
| Deletion | Permanent | Soft delete with a trash folder |
| History | None | Version snapshots with restore |

## What it does

- Create, rename, and edit rich-text documents — bold, italic, underline, headings, and
  bulleted/numbered lists — with autosave.
- Import a `.txt` or `.md` file as a new document.
- Share a document with another user; the dashboard separates documents you own from documents
  shared with you.
- Everything persists and survives a refresh or a server restart.

## Planned stack (v2)

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Editor | TipTap |
| Backend | Python + FastAPI |
| Database | PostgreSQL on Supabase |
| DB access | SQLAlchemy 2.0 (async) + Alembic |
| Auth | Supabase Auth |
| Real-time | Managed collaboration service |
| Hosting | Vercel (frontend) + Render or Fly.io (backend) |

Note that **Next.js is React** — it is a framework built on top of React, not an alternative to it.

## Running v1 locally

The code in the repository right now is v1.

### Requirements

- **Node.js >= 22.5.0** — v1 uses `node:sqlite`, a built-in module available without a flag from
  Node 22.5. Check with `node -v`.
- No external database, API keys, or paid services.

```bash
npm install
npm run dev
```

Open http://localhost:3000. You'll land on a login screen with three seeded accounts — click any one
to continue. The database is created automatically at `data/app.sqlite` on first run and pre-seeded
with example documents.

To reset all data, stop the server and delete `data/app.sqlite*`.

### Production build

```bash
npm run build
```

```bash
npm run start
```

### Tests

```bash
npm test
```

Runs Node's built-in test runner against `test/*.test.ts` — covering document access control
(owner / shared / denied), request validation schemas, and file-import conversion.

## Test accounts (v1)

v1 uses mocked auth, so there is no sign-up flow. Pick any of these on the login screen:

| Name | Email |
|---|---|
| Alice Chen | alice@example.com |
| Bob Martinez | bob@example.com |
| Carol Singh | carol@example.com |

Alice and Bob each start with one seeded document. Bob's "Q3 Roadmap" is pre-shared with Alice, so
the sharing UI has something to show immediately. To test sharing yourself: log in as one user, open
a document you own, click **Share**, and enter another account's email.

## File upload (v1)

Supported types: **`.txt` and `.md`/`.markdown` only**, max 2MB — enforced both in the UI and on the
server.

- `.txt` files split into paragraphs on blank lines.
- `.md` files pass through a small dependency-free converter handling `#`/`##`/`###` headings,
  `**bold**`, `*italic*`, and `-`/numbered lists. It is **not** a full CommonMark parser — no tables,
  code blocks, links, or nested lists.

## Repository layout

```
src/                    v1 application source (Next.js)
  app/                    pages + API routes
  components/             React components
  lib/                    db, repo, auth, validation, file import
test/                   v1 test suite
data/                   SQLite database file (gitignored)
docs/
  superpowers/specs/      design specs for the v2 rebuild
  archive/                original interview submission artifacts
ARCHITECTURE.md         architecture, v1 and v2
DEPLOY.md               deployment guide
```

## Known limitations of v1

These are the reasons v2 exists:

- **Auth is mocked** — no passwords, no sign-up.
- **Sharing is binary** — no view-only vs. edit levels.
- **Markdown import is minimal** — headings, bold, italic, lists only.
- **No real-time collaboration** — autosave only; simultaneous editors silently overwrite each other.
- **No version history, no trash, no undo-delete.**
- **Local SQLite file** — requires a persistent disk, so it cannot scale horizontally.

## Development (v2)

Requires Docker, Python 3.12+, and Node 22.5+.

Start the database:

```bash
docker compose up -d
```

Run the backend:

```bash
cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m alembic upgrade head && .venv/Scripts/python -m uvicorn app.main:app --reload
```

Interactive API docs are then served at http://localhost:8000/docs.

Run the backend tests:

```bash
cd backend && .venv/Scripts/python -m pytest -v
```

### Branching

`main` is always deployable and deploys automatically. Work on short-lived
branches named `feat/<phase>-<thing>` and merge via pull request — CI gates the
merge, and Vercel builds a preview deployment for every PR.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — architecture decisions for both versions
- [DEPLOY.md](DEPLOY.md) — deployment guide
- [Foundation design spec](docs/superpowers/specs/2026-07-25-folium-foundation-design.md) — the full
  v2 design
- [docs/archive/](docs/archive/) — original interview submission notes
