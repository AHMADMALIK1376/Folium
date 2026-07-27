# Folium

A collaborative document editor — create, format, and edit rich-text documents in the browser, and
share them with other people.

> **Status: rebuilding for production — Phase 1 implemented.**
> Folium began as a timeboxed interview assignment and is now being rebuilt as a real product.
> **Phase 1 of the v2 rebuild is implemented**: a separated `frontend/` (Next.js) and `backend/`
> (FastAPI) with PostgreSQL, SQLAlchemy + Alembic, document/sharing/import APIs, and CI. Authentication
> uses real Supabase JWT verification (Phase 2A) — the frontend still runs the old v1 code and is
> not yet connected to the backend. Frontend auth pages, the design system, and the FastAPI
> cut-over remain upcoming phases. See
> [the foundation design spec](docs/superpowers/specs/2026-07-25-folium-foundation-design.md) and the
> [Phase 1 implementation plan](docs/superpowers/plans/2026-07-25-phase-1-foundation.md).

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
frontend/               Next.js application (v1 today, v2 UI going forward)
  src/app/                 pages + API routes
  src/components/          React components
  src/lib/                 db, repo, auth, validation, file import
  test/                    frontend test suite
backend/                FastAPI application (v2)
  app/api/                 route handlers
  app/core/                exceptions, constants
  app/db/                  session, base
  app/models/              SQLAlchemy models
  app/schemas/             pydantic request/response schemas
  app/services/            business logic
  app/utils/               file import, conversions
  alembic/                 database migrations
  tests/                   backend test suite
docs/
  superpowers/specs/      design specs for the v2 rebuild
  superpowers/plans/      implementation plans for the v2 rebuild
  archive/                original interview submission artifacts
.github/workflows/      CI pipelines
docker-compose.yml      local PostgreSQL for development
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

Requires Python 3.12+ and Node 22.5+. Docker is optional.

### Database

Local development uses a **separate Supabase project** — not the production one. The test suite
creates dozens of users and documents on every run, and pointing it at production would accumulate
that in the database holding real user data.

Create a second free project (e.g. `folium-dev`) in the same region as production, then copy
`backend/.env.example` to `backend/.env` and fill in `DATABASE_URL` and `SUPABASE_URL` from it. That
file is gitignored. Read the comments in `.env.example` first — two details bite otherwise: use the
**session** pooler rather than the transaction pooler, and change the URL prefix Supabase gives you
from `postgresql://` to `postgresql+asyncpg://`.

Apply migrations and run the backend:

```bash
cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m alembic upgrade head && .venv/Scripts/python -m uvicorn app.main:app --reload
```

Interactive API docs are served at http://localhost:8000/docs — only when `ENVIRONMENT=development`.

### Faster tests, optionally

The suite takes about 4 seconds against a local database and a minute or two over the network. If
that matters, run PostgreSQL locally instead:

```bash
docker compose up -d
```

Then set `DATABASE_URL=postgresql+asyncpg://folium:folium@localhost:5433/folium`. Nothing else
changes. CI does not use this — it starts its own PostgreSQL service and needs no credentials.

### Authentication

Requests must carry a Supabase-issued JWT as `Authorization: Bearer <token>`. There is no
development bypass — the tests mint their own signed tokens against a local keypair, so the suite
needs neither network access nor Supabase credentials.

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
