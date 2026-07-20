# Architecture Note

## Summary

Single Next.js 15 (App Router) app doing double duty as frontend and backend: React Server/Client Components for UI, API routes for the REST-ish surface, `node:sqlite` for persistence. One deployable unit, one process, one database file. For a 4-6 hour scope with one reviewer testing it, that's the simplest architecture that still demonstrates real full-stack judgment (schema design, access control, validation, API design) without the overhead of a separate backend service.

## What I prioritized, and why

1. **A genuinely usable editor over a feature-complete one.** Bold/italic/underline/headings/lists cover the assignment's explicit requirements and are what most real documents actually use. I did not add tables, images-in-document, comments, or code blocks — not because they're hard, but because polishing five formatting types with reliable autosave felt like a better use of the time budget than shipping ten half-working ones.
2. **Correct access control over rich permissions.** Sharing is binary (owner vs. has-access) rather than view/comment/edit roles. The assignment asks for "a visible distinction between owned and shared documents" and "a way to grant another user access" — I implemented that precisely, with server-side enforcement (every document API route re-checks ownership/share status, not just the UI), rather than half-implementing role-based permissions.
3. **A small, dependency-free markdown importer over a full CommonMark library.** The importer only needs to produce formatting the editor itself understands (headings, bold, italic, lists) — pulling in a full markdown parser for that would be dependency weight without added value for this scope.
4. **Real persistence over an in-memory mock.** Documents, shares, and users all live in SQLite and survive restarts — this was a hard requirement, not a nice-to-have.

## What I deliberately cut

- **Real authentication.** The assignment explicitly permits mocked auth/seeded accounts. Implementing real password hashing, sessions, and sign-up would have eaten hours better spent on the editor and sharing logic, for a reviewer-facing demo where it adds no signal.
- **Real-time collaborative editing** (live multi-cursor, operational transforms). Listed as an optional stretch goal in the brief; explicitly deprioritized per the instructions ("do not sacrifice core functionality to pursue stretch work").
- **Version history / undo-delete / trash.** Would be the first thing I'd add with more time (see below).
- **Granular permission levels** (view-only vs. edit) — everyone with access can currently edit. Simpler and still demonstrates the sharing model the assignment asks for; a real product would need this though.

## Data model

Four tables, `users`, `documents`, `document_shares`, `attachments` (the last one is schema-ready but not wired into the UI — see below). Access control is one function: `canAccessDocument(doc, userId, sharedUserIds)` — owner or in the share list, nothing more. It's pure (no I/O), which is why it's unit tested directly rather than through an HTTP round-trip.

Every document API route does the same three things in order: authenticate (cookie → user), authorize (`getDocumentWithMeta` returns `null` for both "doesn't exist" and "you can't see it" — deliberately, to avoid leaking document existence to unauthorized users via a 403-vs-404 timing/response difference), then validate the request body with Zod before touching the database.

## A real decision made mid-build: why `node:sqlite` instead of Prisma

I started this build with Prisma + SQLite, which was the obvious choice. Partway through, I hit a wall: Prisma's `@prisma/engines` package downloads a native query-engine binary from a third-party CDN (`binaries.prisma.sh`) during install, and in the sandboxed environment I was building in, that CDN was blocked at the network level (403). No amount of retrying or cache-priming fixes that — it's a hard external dependency Prisma requires at install time that I could not control.

Rather than burn the remaining time budget fighting an environment constraint, I made a call: drop Prisma, use Node's built-in `node:sqlite` module instead (stable-enough since Node 22.5, ships with the runtime, zero extra install). This meant hand-writing the schema (plain `CREATE TABLE IF NOT EXISTS` statements) and query layer (parameterized `prepare()`/`run()`/`get()`/`all()` calls) instead of getting them generated — a bit more typing, but it removed an entire class of install-time fragility and an external network dependency for something as basic as local persistence. I'd make the same call again: a demo app that reliably starts beats one with a nicer ORM that might not install in someone else's constrained environment either.

The tradeoff: no Prisma Studio, no auto-generated migrations, and `node:sqlite` is still an experimental Node API (though stable behavior since 22.5, with an `ExperimentalWarning` printed at startup that's safe to ignore). For a project this size, I judged that acceptable.

## Deployment note (also see `DEPLOY.md`)

Because persistence is a single SQLite file on local disk, this app needs a **long-running process with a writable local filesystem** — not a serverless/edge platform. Serverless platforms (Vercel's default deployment model, for example) run each request in an ephemeral or non-shared filesystem, so a local SQLite file would not reliably persist across requests or concurrent invocations. I deployed instead to a platform that runs the app as a persistent Node process (see `DEPLOY.md` for the exact steps and reasoning). This is the kind of infrastructure tradeoff the assignment specifically asks candidates to reason about explicitly, so I wanted to call it out rather than let it be implicit.

## Post-build security patch: Next.js 14 → 15

The project was originally built on Next.js 14.2.5. After a first local `npm install` on a clean machine, npm flagged that version as having a known vulnerability. I looked into it: Next.js had backported a fix for one CVE to 14.2.35, but a separate high-severity denial-of-service issue in Server Components (CVE-2025-55184, fully fixed under CVE-2025-67779) was never backported to the 14.x line at all — it's only fixed from Next.js 15.0.7 onward. Since this app uses the App Router with Server Components throughout, that issue applies directly, not just in theory.

Given that, I upgraded to Next.js 15.5.20 rather than settling for the incomplete 14.2.35 patch. That required a small, mechanical migration: Next 15 made `cookies()` and dynamic route `params` asynchronous, so `src/lib/auth.ts` and every API route/page reading a route param needed an `await` added. No behavioral changes, no new bugs — re-verified with a clean type check, the full test suite, and a full production build plus an end-to-end API smoke test afterward. This is the kind of "AI-assisted, not AI-blind" verification loop called out in `AI_WORKFLOW.md`: I didn't take the upgrade on faith, I re-ran everything that had passed before.

## What I'd build next with another 2-4 hours

1. **Document version history** — append-only snapshot table on save, with a simple "restore this version" UI. The schema change is trivial (a `document_versions` table); the UI is the bulk of the work.
2. **View-only vs. edit sharing permissions** — add a `permission` column to `document_shares`, gate the editor's `editable` prop and the PATCH route on it.
3. **Export to PDF/Markdown** — listed as a stretch goal; would reuse the existing HTML content with a headless-Chrome or markdown-serializer pass.
4. **Attachments UI** — the `attachments` table already exists in the schema (upload → create-document is wired up; attach-a-file-to-an-existing-document is not). Finishing the UI for that was cut to keep upload scope tight and well-tested rather than half-covering two upload modes.
5. **Optimistic concurrency on autosave** — right now, two people editing the same document simultaneously will silently overwrite each other's last save (last-write-wins). A version/timestamp check with a "this doc changed, reload?" prompt would be the first real-time-collaboration-adjacent improvement before attempting true live co-editing.
