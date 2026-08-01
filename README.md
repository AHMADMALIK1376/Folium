# Folium

A collaborative document editor — create, format, and edit rich-text documents in the browser, and
share them with other people.

> **Status: the rebuild is complete through Phase 4-i. There is no v1 code left.**
> Folium began as a timeboxed interview assignment and has been rebuilt as a real product: a Next.js
> frontend and a FastAPI backend on PostgreSQL, with real authentication through Supabase, documents
> stored as TipTap JSON, sharing with permission levels, soft delete with a trash folder, file
> import, version history with restore, and live collaborative editing.
>
> **Still to come:** offline editing and reconnection polish. Live collaboration works when a
> y-sweet server is configured; without one the editor falls back to single-user autosave, and two
> people editing at once overwrite each other — which is what version history exists to rescue.

---

## Rebuild progress

| Phase | Deliverable | Status |
|---|---|---|
| [1](docs/superpowers/plans/2026-07-25-phase-1-foundation.md) | Split frontend and backend; PostgreSQL, SQLAlchemy + Alembic, document/sharing/import APIs, CI | Done |
| [2A](docs/superpowers/plans/2026-07-27-phase-2a-backend-auth.md) | Backend verifies Supabase JWTs; no development bypass | Done |
| [2B](docs/superpowers/plans/2026-07-28-phase-2b-frontend-auth.md) | Design system, sign-up / sign-in / password reset, route guard, `/account` | Done |
| [2C-i](docs/superpowers/plans/2026-07-28-phase-2c-i-dashboard.md) | Dashboard and trash on FastAPI: create, delete, restore | Done |
| [2C-ii](docs/superpowers/plans/2026-07-30-phase-2c-ii-editor.md) | The editor: open a document, edit it, rename it, autosave as TipTap JSON | Done |
| [2C-iii](docs/superpowers/plans/2026-07-30-phase-2c-iii-sharing-import.md) | Sharing with permission levels, file import, and deleting all v1 code | Done |
| [3](docs/superpowers/plans/2026-08-01-phase-3-version-history.md) | Version history: snapshots as you edit, preview, and restore | Done |
| [4-i](docs/superpowers/plans/2026-08-01-phase-4-i-live-collaboration.md) | Live collaboration: shared editing with cursors, over y-sweet | Done |
| 4-ii | Reconnection, offline behaviour, and server-side reconciliation | Next |

See the [foundation design spec](docs/superpowers/specs/2026-07-25-folium-foundation-design.md) for
the full v2 design.

## What the rebuild changed

v1 was a single Next.js app with mocked auth and a local SQLite file. None of it remains.

| | v1 | Today |
|---|---|---|
| Architecture | One Next.js app, frontend + API together | Separate Next.js frontend and FastAPI backend |
| Auth | Mocked — 3 seeded accounts, no passwords | Real sign-up via Supabase Auth |
| Database | Local SQLite file | PostgreSQL on Supabase |
| Content storage | HTML string | TipTap JSON |
| Sharing | Binary — has access or doesn't | View / comment / edit permissions |
| Deletion | Permanent | Soft delete with a trash folder |
| Collaboration | Autosave, refresh to see others' edits | Live shared editing with cursors |
| History | None | Version snapshots with restore |

## What it does

- Create, rename, and edit rich-text documents — bold, italic, underline, headings, and
  bulleted/numbered lists — with autosave.
- Import a `.txt` or `.md` file as a new document.
- Share a document by email with view or edit access, change someone's level, or revoke it. The
  dashboard separates documents you own from documents shared with you.
- Edit a document with someone else at the same time, seeing their cursor and their text as they
  type — when a collaboration server is configured.
- Browse a document's version history, preview an earlier draft, and restore it.
- Delete a document and restore it from the trash.
- Everything persists and survives a refresh or a server restart.

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

Real-time uses [y-sweet](https://github.com/jamsocket/y-sweet), an MIT-licensed Yjs host that can be
self-hosted or run on Jamsocket. It is optional: with no server configured, editing is last-write-wins
and everything else is unchanged.

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

Frontend tests:

```bash
cd frontend && npm test
```

Vitest, over the components, hooks, and API clients. `npm run e2e` runs Playwright — see
[End-to-end tests](#end-to-end-tests).

### Left over from v1

Nothing in the codebase. If you ran v1 before, delete its database file — nothing reads it any more:

```bash
rm -rf data/
```

## File import

Supported types: **`.txt` and `.md`/`.markdown` only**, max 2MB — checked in the browser for a fast
rejection and enforced by the backend, which does the conversion.

- `.txt` files split into paragraphs on blank lines.
- `.md` files pass through a small dependency-free converter handling `#`/`##`/`###` headings,
  `**bold**`, `*italic*`, and `-`/numbered lists. It is **not** a full CommonMark parser — no tables,
  code blocks, links, or nested lists.

## Live collaboration

Optional, and off unless the backend has `Y_SWEET_CONNECTION_STRING` set. With it, two people editing
one document see each other's text and cursors as they type; without it, the editor behaves exactly as
it does alone. A viewer receives a **read-only room token**, so the server itself refuses their writes
rather than trusting the browser.

Postgres stays the record of truth: the client that made a change still saves the merged document
through the API, so version history, the dashboard, and everything else are unaffected.

To run one locally, in a third terminal:

```bash
cd frontend && npm run collab
```

Then set `Y_SWEET_CONNECTION_STRING=ys://127.0.0.1:8080` in `backend/.env` and restart the backend.
Use `127.0.0.1`, not `localhost` — on Windows the latter tries IPv6 first and costs about two seconds
per call, which the editor pays twice before it opens.

That script exists rather than calling the binary directly because of two Windows quirks: the
published binary has no `.exe` extension, so PowerShell offers to *open* it rather than run it, and
the package's own wrapper exits immediately in some shells while reporting success.

## Version history

Every document keeps earlier drafts, saved as you edit. Open one and click **History** to preview a
version and restore it; restoring is itself recorded, so restoring the wrong draft is undoable.

Snapshots are deliberately not taken on every save — autosave fires roughly every 800ms, and doing so
would put hundreds of full-document copies per session into a free-tier database. A version is written
when:

- the document has no history yet, **or**
- the newest version is more than five minutes old, **or**
- someone other than the last author is editing.

That last rule is the one that matters most: two collaborators overwriting each other is exactly what
history exists to rescue, and time alone would let one silently replace the other inside a single
window.

Each document keeps its newest 50 versions. Changing only the title records nothing. Anyone who can
view a document can read its history; only someone who can edit it can restore.

## Repository layout

```
frontend/               Next.js application
  src/app/(auth)/          sign-in, sign-up, password reset, OAuth callback
  src/app/(app)/           dashboard, trash, editor, account — behind the route guard
  src/components/          React components (ui/ is shadcn, on React 18 refs)
  src/lib/                 API clients, Supabase clients, hooks, validation
  src/middleware.ts        route guard — must live in src/, not the project root
  e2e/                     Playwright specs
backend/                FastAPI application
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

## Known limitations

- **Real-time collaboration needs a y-sweet server.** Without one the editor still works, but two
  people editing at once overwrite each other — recoverable from version history, not prevented.
- **No offline editing.** Losing the connection mid-session is Phase 4-ii.
- **Version history is automatic, not manual.** A snapshot is kept at most every five minutes per
  author, and only the newest 50 per document, so the very last keystrokes before a mistake may not
  have their own version.
- **Markdown import is minimal** — headings, bold, italic, and lists only.
- **Sharing needs an existing account.** There are no pending invitations, so sharing with an address
  that has not signed up fails rather than waiting for them.
- **No comments**, though the permission model already carries a `comment` level for them.

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

Playwright drives a real browser through sign-up, sign-in, the route guard, and sign-out; creating a
document, deleting it, finding it in the trash, and restoring it; and opening a document, typing,
reloading to prove the text persisted, and renaming it — all against a real Supabase project. It runs locally only — CI holds no Supabase credentials, and supplying them
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
