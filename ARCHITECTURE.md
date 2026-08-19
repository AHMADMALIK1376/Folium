# Architecture

This document covers two things: the architecture Folium **has today** (v2), and the interview build
it replaced (v1), kept because the reasoning for several decisions only makes sense against what came
before. The full v2 design lives in
[the foundation design spec](docs/superpowers/specs/2026-07-25-folium-foundation-design.md); this is
the summary and the reasoning.

---

# Part 1 — v2: the production architecture

**Status: implemented through Phase 4.** Version history and live collaboration are built, including
cursor identity, a connection indicator, and recovery when a room is ahead of the database.

Reconciliation runs **in the browser**, not the server, and that is a constraint rather than a
preference: `y-sweet-sdk` pins `pycrdt` below the version that gained XML types, so reading a Yjs
document in Python would mean breaking the pin or hand-writing a decoder to duplicate a conversion the
browser already performs correctly. A client that syncs holds both copies, so it is also the one place
where the comparison is free.

The collaboration service is **y-sweet**, chosen over the better-known alternative for one structural
reason: it has a Python SDK, so the function that checks whether a caller may open a document and the
function that mints its room token are the same function, in the service that owns every other
permission decision. The alternative documents only a Node SDK for issuing tokens, which would have
meant a Next.js route handler holding the vendor secret — reintroducing the server-side-in-Next
arrangement Phase 2C-iii deleted. y-sweet is also MIT-licensed and self-hostable, so the vendor is
replaceable rather than load-bearing, which is the same principle as keeping Postgres the record of
truth.

## Summary

Two independently deployable applications in one repository. A Next.js frontend on Vercel, a FastAPI
backend on a persistent Python host, PostgreSQL and authentication on Supabase, and a managed service
handling real-time collaboration.

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

## How a request flows

1. **Sign-in goes directly from the frontend to Supabase.** Supabase validates the password and
   returns a JWT. The FastAPI backend never sees passwords at all.
2. **Every API call carries that token** in an `Authorization: Bearer` header. FastAPI verifies the
   signature against Supabase's published JWKS and resolves the calling user. This replaces v1's
   session cookie, which cannot work cleanly once the frontend and backend live on different origins.
3. **FastAPI owns all business logic** — document CRUD, permission checks, sharing. It is the only
   component that holds database credentials.
4. **The collaboration service handles live editing** over a WebSocket, merging concurrent edits and
   broadcasting cursor positions.
5. **Merged documents are written back through FastAPI** on an interval.

**The governing principle:** the collaboration service is a fast-moving cache for in-progress edits;
PostgreSQL is the source of truth. Losing the vendor must never mean losing documents.

**The frontend never touches the database directly.** Supabase is used from the browser *only* for
authentication. Every permission check happens server-side, in one place.

## Why these technologies

**Next.js over plain React + Vite.** Next.js *is* React — a framework built on it, not a competitor.
Vite would mean losing server-side rendering, which a real product needs for an indexable marketing
page, and rebuilding routing that Next.js already provides.

**FastAPI over Django or Flask.** Django's headline advantages are its admin panel and built-in auth;
Supabase provides auth, which removes most of that benefit, and Django's WebSocket story (Channels)
is materially more awkward than FastAPI's native async. Flask has the weakest async support of the
three. Real-time collaboration means many concurrent long-lived connections, and that is precisely
FastAPI's strength.

**PostgreSQL over MongoDB.** The data is inherently relational — users own documents, documents are
shared with users. A document store would mean reimplementing joins by hand.

**Supabase for both database and auth.** It collapses two decisions into one free-tier vendor and
supplies OAuth and email flows without a separate email provider. Lock-in is limited by design: the
application keeps its **own** `users` table in that same Postgres, referencing Supabase's auth user
id. `documents` and `document_shares` point at the application's table, so the schema stays portable —
leaving Supabase would mean migrating authentication, not the whole data model.

**A managed collaboration service over self-hosting.** This is a direct consequence of the $0
budget, and it is worth being explicit about because it looks like a luxury and is actually the
opposite. WebSocket connections need an always-on server process, but free hosting tiers sleep after
inactivity, dropping live connections. A managed service provides always-on sync infrastructure
without paying for an always-on process, and lets FastAPI serve only REST traffic, which tolerates
cold starts far better.

**Python over Node/TypeScript**, accepting a real tradeoff. A TypeScript backend would allow shared
types across the stack and near plug-and-play Yjs integration. Python was chosen for the developer's
existing strength, and the collaboration gap was closed by using a managed service rather than
hand-building CRDT sync.

**Managed auth over self-built.** Building it properly means password hashing, JWT and refresh token
rotation, email verification, password reset, OAuth, and login rate limiting — roughly 4–7 days, with
the security risk carried personally. Deferred, possibly revisited as a learning exercise after
launch.

## Backend layering

`api/` handles HTTP only — parsing, validation, status codes. `services/` holds business logic and
knows nothing about HTTP. `models/` talks to the database. This separation is what makes permission
logic testable without starting a web server.

Two properties are carried over from v1 unchanged, because they were already right:

- **Pydantic schemas stay separate from SQLAlchemy models.** The API contract and the database tables
  are different things and must be free to change independently.
- **`can_access_document` stays a pure function** with no database calls inside it, so it can be unit
  tested directly rather than through an HTTP round-trip.

**External services get exactly one module each, and that module is the test seam.** `services/collab.py`
mints y-sweet room tokens; `services/storage.py` is the only thing that speaks to Supabase Storage.
Nothing else in the codebase knows that either is HTTP, which is what lets the attachment tests run
with no bucket, no key, and no network — the boundary is replaced wholesale.

Both follow the same rule about failure: an outage raises a domain error that maps to **503**, never
a 404 and never a 500. Phase 2A drew that line for JWKS and it holds throughout — infrastructure
being unreachable must never be indistinguishable from "you may not see this."

**Permission stays in the backend even where the vendor could enforce it.** Attachments are stored
with a service-role key that bypasses row-level security, and every access decision is made here
first, by the same `resolve_permission` every other route uses. Pushing it into RLS policies would
mean expressing Folium's ownership-and-shares model a second time in SQL; two implementations of one
permission model drift, and the first disagreement is someone reading a document they were removed
from.

## The data model, and what changed

Eight tables: `users`, `documents`, `document_shares`, `document_versions`, `attachments`,
`document_stars`, `folders` and `comments` — the last three added in Phases 8, 13 and 14. The full
DDL is in the spec. The changes that matter:

**`content` becomes `jsonb` instead of an HTML string.** The most consequential change. v1 stores
rendered HTML; TipTap's native format is JSON, with HTML as one possible export. Storing JSON means
never parsing HTML to manipulate a document, makes content queryable, and is required by the
collaboration service, which operates on structured nodes. Staying on HTML would actively obstruct
real-time editing.

**A `permission` column on shares** — view / comment / edit, replacing v1's binary access. The
middle level was inert until Phase 14, when comments gave it something to do.

**A `document_versions` table** — snapshots on meaningful saves, enabling restore.

"Meaningful" carries the weight here, and Phase 3 had to define it. Autosave fires roughly every
800ms, so snapshotting each save would put hundreds of full-document JSONB copies per session into a
database whose free tier holds 500MB of real users' documents. A version is written only when the
document has no history, when the newest is over five minutes old, or when **a different author** is
saving than last time — that third rule being the one the feature exists for, since two collaborators
overwriting each other inside one window would otherwise keep nothing. Each write prunes that document
to its newest 50, in the same transaction, so retention cannot drift from the insert that triggered
it. The row holds the content being *replaced*, which is what makes restoring mean "go back" rather
than "duplicate what is on screen".

**Soft delete** via `is_deleted` and `deleted_at`. v1 deletes permanently, which for real users is a
support nightmare.

**`uuid` and `timestamptz`** instead of custom string ids and text timestamps. UUIDs align with
Supabase auth ids; real timestamps sort correctly across timezones.

**Attachments store a path, not bytes.** v1 keeps file bytes in a `BLOB` column, which bloats the
database, slows backups, and burns the free-tier storage quota. Files belong in Supabase Storage.

**A `comments` table whose anchor is text, not a position.** `quote`, `prefix` and `suffix` rather
than offsets or a mark in the content — and that is a permissions decision as much as a durability
one. A mark would make commenting a content write, which is exactly what the `comment` permission
withholds; offsets drift on every edit above them. The passage is found by searching for the quote
and highlighted with a ProseMirror decoration, so nothing about commenting touches the document.
`author_id` is `ON DELETE SET NULL` (a discussion outlives its participants) while `parent_id`
cascades (a reply without its comment is meaningless).

**A `folders` table, and `documents.folder_id` as `ON DELETE SET NULL`.** The null is the design.
Cascading would make reorganising destructive — deleting a folder would delete work — and the app
already has a trash for deletion. A folder is unique per `(owner_id, name)`, holds only documents its
owner owns, and does not nest: it is a label, never a gate, so nothing about it participates in an
access decision.

## Error handling

**Unauthorized access returns 404, not 403** — carried over from v1 deliberately. A 403 confirms that
a document exists, leaking information to someone who should not have it. The lookup returns nothing
for both "absent" and "forbidden".

Validation errors return 422 with field-level detail. Domain errors are typed exceptions mapped to
status codes by registered handlers, so `services/` never imports HTTP concepts. Unexpected
exceptions return a generic 500 with a correlation id logged server-side; internal detail never
reaches the client. Upload limits are enforced server-side, never trusting the client filter alone.

## Brand system

Two brand colours: **carmine `#D41F26`** and **white `#FFFFFF`**, plus a functional neutral ramp.
Greys are structure, not brand — without them, text hierarchy, borders, and disabled states cannot be
expressed.

Carmine on white measures approximately **5.2:1** contrast: passes WCAG AA for normal text, fails
AAA. It is an accent colour, not a body-copy colour.

**Known risk:** the brand colour is red, which collides with the convention of red meaning "error" or
"destructive". Mitigation: error text uses the darker `carmine-700`, and destructive actions use
`carmine-700` *plus* a confirmation dialog, making them visually and interactionally heavier than a
normal primary button.

## The budget constraint, stated honestly

Folium targets a **$0/month** operating cost, and that conflicts with "real product with real users"
specifically around real-time collaboration. Two consequences are accepted:

1. The managed collaboration service is not optional at this budget — it is what makes always-on
   WebSockets possible without an always-on server.
2. **Paid hosting becomes necessary at real traffic**, realistically ~$20–25/month. Free tiers are
   sufficient for launch and early users only.

---

# Part 2 — v1: the interview build

**History.** None of this code is in the repository any more — Phase 2C-iii deleted it. It is kept
here because the v2 decisions above were made against these constraints, and "why not just keep
SQLite" is a fair question that deserves the original answer rather than a summary of it.

## Summary

A single Next.js 15 App Router application doing double duty as frontend and backend: React
Server/Client Components for UI, API routes for the REST-ish surface, `node:sqlite` for persistence.
One deployable unit, one process, one database file. For a 4–6 hour scope with one reviewer testing
it, that was the simplest architecture that still demonstrated schema design, access control,
validation, and API design without the overhead of a separate backend service.

## What was prioritized, and why

1. **A genuinely usable editor over a feature-complete one.** Bold/italic/underline/headings/lists
   cover what most real documents use. Tables, in-document images, comments, and code blocks were
   omitted — not because they're hard, but because polishing five formatting types with reliable
   autosave was a better use of the time budget than shipping ten half-working ones.
2. **Correct access control over rich permissions.** Sharing is binary rather than role-based, but
   enforced server-side on every document route, not merely hidden in the UI.
3. **A small, dependency-free markdown importer over a full CommonMark library.** The importer only
   needs to produce formatting the editor itself understands.
4. **Real persistence over an in-memory mock.** Documents, shares, and users survive restarts.

## What was deliberately cut

- **Real authentication** — the assignment explicitly permitted mocked auth and seeded accounts.
- **Real-time collaborative editing** — a listed optional stretch goal, explicitly deprioritized.
- **Version history, undo-delete, trash.**
- **Granular permission levels** — everyone with access can edit.

## Data model

Four tables: `users`, `documents`, `document_shares`, `attachments` (the last schema-ready but not
wired into the UI). Access control is one function, `canAccessDocument(doc, userId, sharedUserIds)` —
owner or in the share list, nothing more. It is pure, which is why it is unit tested directly rather
than through an HTTP round-trip.

Every document API route does the same three things in order: authenticate (cookie → user), authorize
(`getDocumentWithMeta` returns `null` for both "doesn't exist" and "you can't see it", deliberately,
to avoid leaking document existence), then validate the request body with Zod before touching the
database.

## A real decision made mid-build: why `node:sqlite` instead of Prisma

The build started with Prisma + SQLite, the obvious choice. Partway through it hit a wall: Prisma's
`@prisma/engines` package downloads a native query-engine binary from a third-party CDN
(`binaries.prisma.sh`) during install, and in the sandboxed build environment that CDN was blocked at
the network level (403). No amount of retrying or cache-priming fixes that — it is a hard external
dependency required at install time.

Rather than burn the remaining time budget fighting an environment constraint, the call was to drop
Prisma and use Node's built-in `node:sqlite` instead — stable since Node 22.5, ships with the
runtime, zero extra install. That meant hand-writing the schema and query layer instead of getting
them generated: more typing, but it removed an entire class of install-time fragility for something
as basic as local persistence.

The tradeoff: no Prisma Studio, no auto-generated migrations, and `node:sqlite` remains an
experimental Node API (stable behaviour since 22.5, with an `ExperimentalWarning` at startup that is
safe to ignore).

**Note for v2:** this constraint no longer applies. v2 uses SQLAlchemy and Alembic against
PostgreSQL, which have no comparable install-time binary dependency.

## Deployment constraint

Because persistence is a single SQLite file on local disk, v1 needs a **long-running process with a
writable local filesystem** — not a serverless or edge platform. Serverless platforms run each
request with an ephemeral or non-shared filesystem, so a local SQLite file would not reliably persist
across requests or concurrent invocations.

**This constraint disappears in v2**, since Postgres is a network service — which is what allows the
v2 frontend to deploy to Vercel.

## Post-build security patch: Next.js 14 → 15

v1 was originally built on Next.js 14.2.5. A clean `npm install` flagged that version as vulnerable.
Next.js had backported a fix for one CVE to 14.2.35, but a separate high-severity denial-of-service
issue in Server Components (CVE-2025-55184, fully fixed under CVE-2025-67779) was never backported to
the 14.x line at all — it is only fixed from Next.js 15.0.7 onward. Since the app uses the App Router
with Server Components throughout, that issue applied directly.

The upgrade to 15.5.20 required a small mechanical migration: Next 15 made `cookies()` and dynamic
route `params` asynchronous, so `src/lib/auth.ts` and every API route or page reading a route param
needed an `await` added. No behavioural changes; re-verified with a clean type check, the full test
suite, a production build, and an end-to-end API smoke test.
