# Folium v2 — Foundation Design

**Date:** 2026-07-25
**Status:** Approved, not yet implemented
**Scope:** Phase 1 of 5 — architecture, repository structure, technology stack, database schema, and brand system.

---

## 1. Context

Folium v1 was built as a timeboxed interview assignment: a single Next.js 15 application using
Node's built-in `node:sqlite` module, mocked authentication over three seeded accounts, and a
TipTap rich-text editor. It works, and the code quality is sound — the access-control logic is a
pure, unit-tested function, and Pydantic-style validation boundaries are already respected.

The goal now is different: **turn Folium into a real product that real people use.** That changes
the requirements fundamentally. Mocked auth, a local SQLite file, and last-write-wins autosave are
all acceptable for a demo and unacceptable for production.

### Constraints

| Constraint | Value |
|---|---|
| Budget | $0/month — free tiers only |
| Team | Solo developer |
| Pace | ~10–15 hours/week, steady side project |
| Existing data | None to preserve; clean cutover is safe |
| Backend language preference | Python |

### The budget tension, stated honestly

"$0/month" and "real product with real users" conflict specifically around real-time
collaboration. WebSocket connections require an always-on server process, but most free hosting
tiers sleep after ~15 minutes of inactivity, dropping live connections and taking 30–60 seconds to
wake.

Two consequences are accepted up front:

1. A **managed collaboration service** is used rather than a self-hosted WebSocket server. This
   provides always-on sync infrastructure without paying for an always-on process, and lets the
   FastAPI backend serve only REST traffic, which tolerates cold starts far better.
2. **Paid hosting becomes necessary at real traffic** — realistically ~$20–25/month. Free tiers
   are sufficient for launch and early users only.

Free-tier limits change frequently. Verify current limits on each provider's pricing page before
committing; no specific quota numbers are recorded here because they would go stale.

---

## 2. Technology decisions

| Layer | Choice | Primary reason |
|---|---|---|
| Frontend | Next.js (React) + TypeScript | Already in use; SSR gives an indexable marketing page |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, accessible components you own outright |
| Editor | TipTap | Already integrated; official collaboration extension exists |
| Backend | Python + FastAPI | Async-native for WebSockets; Pydantic validation; auto OpenAPI docs |
| Database | PostgreSQL on Supabase | Data is relational; one vendor covers database and auth |
| DB access | SQLAlchemy 2.0 (async) + Alembic | Standard FastAPI pairing; real migrations |
| Auth | Supabase Auth | Sign-up, verification, reset, and OAuth without hand-rolling security |
| Real-time | Managed collaboration service | Always-on WebSocket infrastructure on a free tier |
| File storage | Supabase Storage | Keeps binary blobs out of Postgres |

### Rejected alternatives and why

**Plain React + Vite instead of Next.js.** Next.js *is* React — it is a framework built on React,
not a competitor. Vite would mean losing server-side rendering, which a real product needs for an
indexable landing page, and rebuilding routing that Next.js provides. Existing working code would
be discarded for no gain.

**Django instead of FastAPI.** Django's main advantages are its admin panel and built-in auth.
Supabase supplies auth, which removes most of that benefit, and Django's WebSocket story (Channels)
is materially more awkward than FastAPI's native async. Flask was ruled out for the weakest async
support of the three.

**Node/TypeScript backend.** Would allow shared types across the stack and near plug-and-play Yjs
integration. Rejected in favour of the developer's existing Python strength, with the collaboration
gap closed by using a managed service instead of hand-building CRDT sync.

**Self-built authentication.** Roughly 4–7 days of work covering password hashing, JWT and refresh
token rotation, email verification, password reset, OAuth, and login rate limiting — with the
security risk carried personally. Deferred; may be revisited as a learning exercise *after* launch.

**MongoDB.** The data is inherently relational (users own documents, documents are shared with
users). Document stores would require reimplementing joins by hand.

---

## 3. Repository structure

**One repository containing two independently deployable applications.** Vercel and
Render/Fly both support deploying from a subdirectory, so independent deploys and a single repo are
compatible. A single repo is chosen because a solo developer benefits from cross-cutting changes
landing in one commit; separate repos only pay off when separate teams own each side.

```
folium/
├── frontend/                    → deploys to Vercel
├── backend/                     → deploys to Render / Fly.io
├── docs/
├── .github/workflows/           → CI: lint + test both sides
└── README.md
```

### frontend/

```
frontend/
├── src/
│   ├── app/
│   │   ├── (marketing)/         public, SEO-indexed landing page
│   │   ├── (auth)/              login, signup, reset-password
│   │   ├── (app)/               authenticated area
│   │   │   ├── dashboard/
│   │   │   └── documents/[id]/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── editor/              Editor, Toolbar, collaboration cursors
│   │   ├── documents/           DocumentCard, ShareModal
│   │   ├── layout/              TopBar, Sidebar
│   │   └── ui/                  shadcn/ui primitives
│   ├── lib/
│   │   ├── api/                 typed API client, one module per resource
│   │   ├── auth/                Supabase client + session hooks
│   │   └── hooks/
│   └── types/                   generated from the backend OpenAPI schema
├── public/
└── package.json
```

Route groups `(marketing)`, `(auth)`, and `(app)` do not appear in URLs but allow each area its own
layout — a server-rendered public page alongside an authenticated client-heavy app.

The v1 `src/app/api/` directory is removed entirely; that logic moves to FastAPI.

### backend/

```
backend/
├── app/
│   ├── main.py                  app instance, middleware, CORS, routers
│   ├── config.py                pydantic-settings, environment variables
│   ├── api/
│   │   ├── deps.py              get_db, get_current_user dependencies
│   │   └── v1/
│   │       ├── documents.py
│   │       ├── shares.py
│   │       ├── users.py
│   │       └── uploads.py
│   ├── core/
│   │   ├── security.py          verify Supabase JWT against JWKS
│   │   └── exceptions.py        error types + handlers
│   ├── db/
│   │   └── session.py           async engine + session factory
│   ├── models/                  SQLAlchemy ORM tables
│   ├── schemas/                 Pydantic request/response shapes
│   ├── services/                business logic
│   │   ├── documents.py
│   │   ├── sharing.py
│   │   └── permissions.py       can_access_document — pure, unit tested
│   └── utils/
│       └── import_file.py       .txt/.md → TipTap JSON
├── alembic/versions/
├── tests/{unit,integration}/
├── pyproject.toml
└── Dockerfile
```

The layering is deliberate and load-bearing: `api/` handles HTTP only (parse, validate, status
codes), `services/` holds business logic and knows nothing about HTTP, `models/` talks to the
database. This is what makes permission logic testable without starting a web server.

Two properties carried over from v1 because they were already correct:

- `schemas/` (Pydantic) stays separate from `models/` (SQLAlchemy). The API contract and the
  database tables are different things and must be free to change independently.
- `permissions.py` keeps a pure `can_access_document` function with no database calls inside it —
  a direct port of the v1 function in `src/lib/repo.ts`.

---

## 4. Architecture and request flow

```
Browser
   │
   ▼
Next.js frontend (Vercel) ──── sign in ────► Supabase Auth
   │                                              │
   ├── REST + JWT ──────► FastAPI (Render) ───────┘ verifies JWT
   │                           │
   │                           ▼
   │                     PostgreSQL (Supabase)
   │                           ▲
   └── WebSocket ──► Collab service ──┘ periodic snapshot via FastAPI
```

1. **Sign-in goes directly from frontend to Supabase.** Supabase validates credentials and returns
   a JWT. The FastAPI backend never sees passwords.
2. **Every API call carries that token** in an `Authorization: Bearer` header. FastAPI verifies the
   signature against Supabase's published JWKS and resolves the calling user. This replaces the v1
   session cookie, which cannot work cleanly once frontend and backend are on different origins.
3. **FastAPI owns all business logic** — document CRUD, permission checks, sharing. It is the only
   component holding database credentials.
4. **The collaboration service handles live editing** over WebSocket: merging concurrent edits and
   broadcasting cursor positions.
5. **Merged documents are persisted back through FastAPI** on an interval, so the record of truth
   always lives in the project's own Postgres, never solely in the vendor's system.

**Governing principle:** the collaboration service is a fast-moving cache for in-progress edits;
PostgreSQL is the source of truth. Losing the vendor must never mean losing documents.

**The frontend never accesses the database directly.** Supabase is used from the browser *only* for
authentication. All data access is mediated by FastAPI, keeping every permission check server-side.

---

## 5. Data model

```sql
users
  id            uuid PK                    -- same id as the Supabase auth user
  email         varchar(320) UNIQUE NOT NULL   -- lowercased by the application layer
  display_name  text NOT NULL
  avatar_url    text
  created_at    timestamptz NOT NULL DEFAULT now()

documents
  id            uuid PK
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  title         text NOT NULL
  content       jsonb NOT NULL             -- TipTap JSON document
  content_text  text                       -- flattened plain text, for search
  is_deleted    boolean NOT NULL DEFAULT false
  deleted_at    timestamptz
  created_at    timestamptz NOT NULL DEFAULT now()
  updated_at    timestamptz NOT NULL DEFAULT now()

document_shares
  id            uuid PK
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  permission    text NOT NULL CHECK (permission IN ('view','comment','edit'))
  granted_by    uuid REFERENCES users(id)
  created_at    timestamptz NOT NULL DEFAULT now()
  UNIQUE (document_id, user_id)

document_versions
  id            uuid PK
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  content       jsonb NOT NULL
  created_by    uuid REFERENCES users(id)
  created_at    timestamptz NOT NULL DEFAULT now()

attachments
  id            uuid PK
  document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  filename      text NOT NULL
  mime_type     text NOT NULL
  size_bytes    bigint NOT NULL
  storage_path  text NOT NULL              -- path in Supabase Storage, not bytes
  created_at    timestamptz NOT NULL DEFAULT now()
```

Indexes: `documents(owner_id)`, `document_shares(document_id)`, `document_shares(user_id)`,
`document_versions(document_id, created_at DESC)`.

### Changes from v1, and why each matters

**`content` becomes `jsonb` instead of an HTML string.** The most consequential change. v1 stores
rendered HTML; TipTap's native format is JSON, with HTML as one possible export. Storing JSON means
never parsing HTML to manipulate a document, enables querying inside content, and is required for
the collaboration service, which operates on structured nodes. Remaining on HTML would actively
obstruct Phase 4.

**`permission` column on shares.** v1 sharing is binary. This introduces view / comment / edit.

**`document_versions` table.** Append a snapshot on meaningful saves, enabling restore of earlier
drafts.

**Soft delete via `is_deleted` + `deleted_at`.** v1 deletes permanently. Real users need a trash
folder and undo.

**`uuid` and `timestamptz` instead of text.** v1 uses custom string ids and text timestamps. UUIDs
align with Supabase auth ids; real timestamps sort and filter correctly across timezones.

**Attachments store a path, not bytes.** v1 keeps file bytes in a `BLOB` column, which bloats the
database, slows backups, and consumes the free-tier storage quota quickly. Files belong in Supabase
Storage.

---

## 6. API surface

All routes are prefixed `/api/v1` (the API's own version, unrelated to Folium v1/v2) and require a
valid bearer token unless noted.

| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Current user profile |
| GET | `/documents` | List owned and shared documents |
| POST | `/documents` | Create a document |
| GET | `/documents/{id}` | Fetch one document |
| PATCH | `/documents/{id}` | Update title and/or content |
| DELETE | `/documents/{id}` | Soft-delete |
| POST | `/documents/{id}/restore` | Undo a soft-delete |
| GET | `/documents/{id}/versions` | List version snapshots |
| POST | `/documents/{id}/versions/{vid}/restore` | Restore a snapshot |
| GET | `/documents/{id}/shares` | List collaborators |
| POST | `/documents/{id}/shares` | Grant access at a permission level |
| PATCH | `/documents/{id}/shares/{uid}` | Change permission level |
| DELETE | `/documents/{id}/shares/{uid}` | Revoke access |
| POST | `/documents/import` | Create a document from an uploaded `.txt`/`.md` |

---

## 7. Error handling

- **Unauthorized access returns 404, not 403.** Carried over from v1 deliberately: a 403 confirms a
  document exists, leaking information to users who should not know. `get_document_for_user`
  returns `None` for both "absent" and "forbidden".
- **Validation errors return 422** with field-level detail, via Pydantic and FastAPI's default
  handler.
- **Domain errors are typed exceptions** in `core/exceptions.py`, mapped to HTTP status codes by
  registered exception handlers, so `services/` never imports HTTP concepts.
- **Unexpected exceptions return a generic 500** with a correlation id logged server-side; internal
  detail is never returned to the client.
- **Upload limits are enforced server-side** (type and size), never trusting the client `accept`
  filter alone.

---

## 8. Testing strategy

| Layer | Tool | Coverage |
|---|---|---|
| Backend unit | pytest | Permission logic, file import conversion, Pydantic schemas |
| Backend integration | pytest + httpx + test database | Every route, including authz denial paths |
| Frontend unit | Vitest | API client, hooks, pure utilities |
| Frontend E2E | Playwright | Sign-up → create → edit → share → collaborator sees it |
| CI | GitHub Actions | Lint, type-check, and test both applications on every push |

The non-negotiable test is the **authorization denial path**: a user without access must receive
404 from every document route. This is the test that protects real users' private data.

---

## 9. Brand and design system

Two brand colours only.

| Token | Hex | Use |
|---|---|---|
| Carmine | `#D41F26` | Primary actions, active states, focus rings, brand marks |
| Blanc | `#FFFFFF` | Backgrounds, surfaces, text on carmine |

Carmine on white measures approximately **5.2:1** contrast — passes WCAG AA for normal text, fails
AAA. It is an accent colour, not a body-copy colour.

A functional neutral ramp is included. Greys are structure, not brand: without them, text
hierarchy, borders, dividers, and disabled states cannot be expressed.

```
carmine-50   #FDF2F2   subtle tint backgrounds
carmine-500  #D41F26   brand: primary buttons, links, focus rings
carmine-600  #B01A20   hover
carmine-700  #8C1419   pressed, and error text
white        #FFFFFF   surfaces, text on carmine
neutral-50   #FAFAFA   page background
neutral-200  #E4E4E7   borders, dividers
neutral-500  #71717A   secondary text, placeholders
neutral-900  #18181B   body text
```

**Known risk:** the brand colour is red, which collides with the near-universal convention of red
meaning "error" or "destructive". Mitigation: error text uses `carmine-700` (visibly darker than
the brand `carmine-500`), and destructive actions use `carmine-700` *plus* a confirmation dialog so
they are visually and interactionally heavier than a normal primary button. If user testing shows
this is still ambiguous, adding a distinct semantic palette is the fallback.

---

## 10. Phase roadmap

| Phase | Deliverable |
|---|---|
| 1 | **This document.** Repo restructure, stack setup, schema, migrations, CI |
| 2 | Real auth and multi-tenant users via Supabase Auth |
| 3 | Production data layer: hosted Postgres, version history, soft delete |
| 4 | Real-time collaboration via the managed collab service |
| 5 | Polish: permission levels, attachments UI, export to PDF/Markdown |

Each phase gets its own spec, implementation plan, and merge before the next begins.

---

## 11. Out of scope

Explicitly not built in Phase 1, to keep it shippable:

- Any authentication implementation (Phase 2)
- Any real-time functionality (Phase 4)
- Billing, subscriptions, or payment handling
- Comments and suggestions (the schema reserves a `comment` permission level, but no comment
  feature is built)
- Mobile applications — the standalone API makes them possible later, but none is planned
- Organisations, teams, or workspace hierarchies; sharing remains user-to-user

---

## 12. Open items to verify before implementation

1. Current free-tier limits and inactivity-pause policies for Supabase, Vercel, and the chosen
   Python host.
2. Which managed collaboration service to use — the decision is deferred to Phase 4, but its free
   tier should be sanity-checked now so Phase 1 does not build toward an unaffordable option.
3. Whether the chosen Python host's free tier keeps cold starts within an acceptable range for REST
   traffic.
