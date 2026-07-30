# Folium

A collaborative document editor — create, format, and edit rich-text documents in the browser, and
share them with other people.

> **Status: rebuilding for production — through Phase 2C-i.**
> Folium began as a timeboxed interview assignment and is now being rebuilt as a real product.
>
> **Working on the v2 stack today:** a separated `frontend/` (Next.js) and `backend/` (FastAPI) on
> PostgreSQL with SQLAlchemy + Alembic and CI; real sign-up and sign-in through Supabase Auth, with
> the backend verifying every JWT against Supabase's published keys; and a server-rendered dashboard
> and trash view where you can create a document, delete it with a confirmation, and restore it.
>
> **Not yet rebuilt:** the editor. Opening a document dead-ends today — rich-text editing, sharing,
> and file import still exist only in the v1 code, which is compiled but firewalled off behind a 404
> because its login route minted sessions with no password. The editor is the next phase.

---

## Rebuild progress

| Phase | Deliverable | Status |
|---|---|---|
| [1](docs/superpowers/plans/2026-07-25-phase-1-foundation.md) | Split frontend and backend; PostgreSQL, SQLAlchemy + Alembic, document/sharing/import APIs, CI | Done |
| [2A](docs/superpowers/plans/2026-07-27-phase-2a-backend-auth.md) | Backend verifies Supabase JWTs; no development bypass | Done |
| [2B](docs/superpowers/plans/2026-07-28-phase-2b-frontend-auth.md) | Design system, sign-up / sign-in / password reset, route guard, `/account` | Done |
| [2C-i](docs/superpowers/plans/2026-07-28-phase-2c-i-dashboard.md) | Dashboard and trash on FastAPI: create, delete, restore | Done |
| 2C-ii | The editor: open a document, edit it, autosave as TipTap JSON | Next |
| 2C-iii | Sharing with permission levels, file import, and deleting all v1 code | After |

Real-time collaboration and version history come after 2C. See the
[foundation design spec](docs/superpowers/specs/2026-07-25-folium-foundation-design.md) for the full
v2 design.

## v1 versus v2

| | v1 (retired, still compiled) | v2 (being built) |
|---|---|---|
| Architecture | One Next.js app, frontend + API together | Separate Next.js frontend and FastAPI backend |
| Auth | Mocked — 3 seeded accounts, no passwords | Real sign-up via Supabase Auth ✅ |
| Database | Local SQLite file | PostgreSQL on Supabase ✅ |
| Content storage | HTML string | TipTap JSON |
| Sharing | Binary — has access or doesn't | View / comment / edit permissions |
| Collaboration | Autosave, refresh to see others' edits | Live multi-cursor editing |
| Deletion | Permanent | Soft delete with a trash folder ✅ |
| History | None | Version snapshots with restore |

✅ marks what is built and working today.

## What it does

The product, with what the rebuild has reached so far:

- Create, rename, and edit rich-text documents — bold, italic, underline, headings, and
  bulleted/numbered lists — with autosave. *Creating works; editing is Phase 2C-ii.*
- Import a `.txt` or `.md` file as a new document. *Returns in 2C-iii.*
- Share a document with another user; the dashboard separates documents you own from documents
  shared with you. *The split dashboard is live; the sharing UI returns in 2C-iii.*
- Delete a document and restore it from the trash. *Live.*
- Everything persists and survives a refresh or a server restart. *Live.*

## The v2 stack

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

Everything above is in place except TipTap, which is installed but not yet wired to the backend
(2C-ii), and real-time, which comes after 2C.

Note that **Next.js is React** — it is a framework built on top of React, not an alternative to it.

## Running it locally

Requires **Python 3.12+** and **Node 22.5+**. Docker is optional. The backend needs a Supabase
project — see [Development](#development) below for that and for the database setup, then start the
frontend:

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. There are no seeded accounts and no click-to-continue login: sign up
with an email and a password, and you land on your dashboard.

The frontend also builds and runs in production mode from `frontend/`:

```bash
cd frontend && npm run build
```

```bash
cd frontend && npm run start
```

### v1 is still in the tree

`frontend/src/app/api/**` and `frontend/src/app/documents/[id]` are v1 code, kept compiling until
Phase 2C-iii deletes them. Middleware returns 404 for both — v1's login route minted a session for a
seeded account with no password, so leaving it reachable would hand anyone the old data layer. The
three seeded accounts (`alice@`, `bob@`, `carol@example.com`) are no longer usable, and the v1 SQLite
file at `data/app.sqlite` is no longer read by anything you can reach.

Its test suite still runs, and still guards the file-import conversion the rebuild will reuse:

```bash
cd frontend && npm test
```

Node's built-in test runner against `test/*.test.ts` — document access control (owner / shared /
denied), request validation schemas, and file-import conversion.

## File upload (v1 — returns in 2C-iii)

Supported types: **`.txt` and `.md`/`.markdown` only**, max 2MB — enforced both in the UI and on the
server.

- `.txt` files split into paragraphs on blank lines.
- `.md` files pass through a small dependency-free converter handling `#`/`##`/`###` headings,
  `**bold**`, `*italic*`, and `-`/numbered lists. It is **not** a full CommonMark parser — no tables,
  code blocks, links, or nested lists.

## Repository layout

```
frontend/               Next.js application
  src/app/(auth)/          sign-in, sign-up, password reset, OAuth callback
  src/app/(app)/           dashboard, trash, account — behind the route guard
  src/app/api/             v1 API routes, retired and 404'd until 2C-iii
  src/components/          React components (ui/ is shadcn, on React 18 refs)
  src/lib/                 API clients, Supabase clients, validation, file import
  src/middleware.ts        route guard — must live in src/, not the project root
  test/                    v1 test suite (node --test)
  e2e/                     Playwright specs
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

## Development

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

### Clearing test data

The free tier allows one project, so development currently shares a database with production. Each
full test run leaves roughly fifty throwaway accounts behind. To remove them:

```bash
cd backend && .venv/Scripts/python scripts/clean_test_data.py
```

That reports what it would delete and changes nothing. Add `--yes` to actually delete. It only ever
removes accounts on `example.com`, `example.org`, and `example.net` — domains RFC 2606 reserves so
they can never belong to a real person — and their documents and shares go with them via cascade.

### End-to-end tests

Playwright drives a real browser through sign-up, sign-in, the route guard, and sign-out, then
through creating a document, deleting it, finding it in the trash, and restoring it — all against a
real Supabase project. It runs locally only — CI holds no Supabase credentials, and supplying them
would mean putting a database password into GitHub secrets and letting every run create accounts.

```bash
cd frontend && npm run e2e:install
```

Start the backend in a second terminal, then:

```bash
cd frontend && npm run e2e
```

Playwright starts the frontend dev server itself; the backend it does not, and every page behind the
guard calls it.

The timeouts are raised above Playwright's defaults on purpose: each protected page is server-rendered
from a FastAPI call to a hosted database, and the App Router commits a URL only once the destination's
payload has arrived, so a sign-in landing legitimately takes several seconds.

Browsers download to `D:\AJAIA\Folium\.playwright-browsers`, not the system drive. The path is set
inside the npm scripts, so it works in any shell without a machine-wide variable.

Two prerequisites live in the Supabase dashboard, not the code:

- **Confirm email must be off** (*Authentication → Sign Up / User Signups → Confirm email*), or a new
  account cannot sign in until a link in a real inbox is clicked. Re-enable before launch.
- Free-tier email is rate-limited to a handful per hour, which is why the tests use password sign-up
  rather than magic links.

Each run creates a real account with a unique `@example.com` address, so runs never collide. Clear
them with `backend/scripts/clean_test_data.py`.

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
- [docs/superpowers/specs/](docs/superpowers/specs/) — a design spec per phase
- [docs/superpowers/plans/](docs/superpowers/plans/) — the implementation plan each phase was built
  from, task by task
- [docs/archive/](docs/archive/) — original interview submission notes
