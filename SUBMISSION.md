# Submission

## Contents of this folder

- `src/` — full application source (Next.js App Router: pages, API routes, components, lib)
- `test/` — automated test suite (`node --test`)
- `data/` — SQLite database lives here at runtime (empty/gitignored in this submission; auto-created and seeded on first run)
- `README.md` — setup and run instructions, test accounts, supported file types, known limitations
- `ARCHITECTURE.md` — architecture note: what was prioritized and why, including the mid-build Prisma → `node:sqlite` decision
- `AI_WORKFLOW.md` — AI tool usage note: what sped things up, what broke, what was verified and how
- `DEPLOY.md` — deployment steps (Railway/Render) and why Vercel's serverless model doesn't fit this app's persistence approach
- `SUBMISSION.md` — this file
- `package.json`, `tsconfig.json`, `next.config.mjs`, etc. — project config

## Source code

https://github.com/AHMADMALIK1376/Folium

## Live product URL

`<< FILL IN: your deployed URL, e.g. https://docsapp-production.up.railway.app >>`

Deployed per the steps in `DEPLOY.md`.

## Test accounts

No sign-up is required — this app uses mocked auth (seeded accounts, no passwords), which is explicitly permitted by the assignment. On the login screen, click any of:

- **Alice Chen** — alice@example.com
- **Bob Martinez** — bob@example.com
- **Carol Singh** — carol@example.com

Bob's "Q3 Roadmap" document is pre-shared with Alice, so the sharing UI has something to show immediately. To test sharing yourself, log in as any user, open a document you own, click **Share**, and enter one of the other two seeded emails.

## Walkthrough video

`<< FILL IN: unlisted Loom/YouTube/Drive link >>`

(Also see the plain-text file with just the URL, per the deliverable checklist — `video_url.txt`.)

## What's working

- Create, rename, and edit documents with rich-text formatting (bold, italic, underline, headings, bulleted/numbered lists), with autosave.
- Reopening a document after refresh (or after logging out and back in) preserves content and formatting exactly.
- File upload: `.txt` and `.md` import, converted into a new formatted document.
- Sharing: owner can grant another seeded user access; dashboard clearly separates owned vs. shared documents; access control is enforced server-side (not just hidden in the UI) — a user without access gets a 404, not just a hidden button.
- Persistence: documents, titles, formatting, and share relationships all survive a server restart (SQLite file on disk).
- Validation and error handling: invalid input (blank titles, malformed share emails, unsupported file types, oversized files, requests without a session) all return clear 4xx errors with a message, not a crash.
- Automated tests (14 passing) covering access control, validation, and file-import conversion.
- Production build (`next build` → `next start`) verified working, not just the dev server.

## What's incomplete / explicitly out of scope

- No real authentication (mocked/seeded accounts only — permitted by the assignment).
- No permission levels for sharing (access is binary: has access or doesn't; everyone with access can edit).
- Markdown import supports headings/bold/italic/lists only, not full CommonMark (tables, code blocks, links, images are not converted).
- No real-time collaborative editing (live multi-cursor) — this was a listed optional stretch goal and was deliberately not pursued in favor of a solid, well-tested core.
- No document version history, no trash/undo-delete.
- The `attachments` database table exists in the schema (for "attach a file to an existing document") but isn't wired into the UI — only "upload a file to create a new document" is implemented, to keep the file-upload feature well-tested rather than half-covering two modes.

## What I'd build next with another 2-4 hours

See the last section of `ARCHITECTURE.md` for the full reasoning. In priority order: document version history, view/edit permission levels for sharing, export to PDF/Markdown, finishing the attachments UI, and optimistic-concurrency handling for simultaneous edits (a step toward real-time collaboration, short of full live co-editing).
