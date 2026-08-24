# Folium

A collaborative document editor — create, format, and edit rich-text documents in the browser, and
share them with other people.

> **Status: the rebuild is complete. The roadmap is finished, and there is no v1 code left.**
> Folium began as a timeboxed interview assignment and has been rebuilt as a real product: a Next.js
> frontend and a FastAPI backend on PostgreSQL, with real authentication through Supabase, documents
> stored as TipTap JSON, sharing with permission levels, soft delete with a trash folder, file
> import and export, version history with restore, attachments, and live collaborative editing.
>
> Two features are optional and configuration-gated, by design rather than by omission: **live
> collaboration** needs a y-sweet server, and **attachments** need a Supabase Storage bucket and a
> service-role key. Without either, the rest of the app is unchanged — without y-sweet the editor
> falls back to single-user autosave, and two people editing at once overwrite each other, which is
> what version history exists to rescue.

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
| [4-ii](docs/superpowers/plans/2026-08-01-phase-4-ii-collaboration-durability.md) | Cursor identity, a connection indicator, and repairing stale documents | Done |
| [5-i](docs/superpowers/plans/2026-08-01-phase-5-i-export.md) | Export: download as Markdown, or print as a PDF | Done |
| [5-ii](docs/superpowers/plans/2026-08-15-phase-5-ii-attachments.md) | Attachments, stored in Supabase Storage | Done |
| [6-i](docs/superpowers/plans/2026-08-15-phase-6-i-editor-parity.md) | Editor parity: every type the editor makes survives export | Done |
| [6-ii](docs/superpowers/plans/2026-08-16-phase-6-ii-links-tasks.md) | Links and checklists | Done |
| [6-iii](docs/superpowers/specs/2026-08-16-phase-6-iii-slash-menu-tables-design.md) | A `/` menu for inserting any block | Done |
| 6-iv | Tables | Done |
| [7-i](docs/superpowers/specs/2026-08-16-phase-7-i-search-design.md) | Search across titles and bodies | Done |
| 7-ii | Combined marks round-trip losslessly | Done |
| 8 | A sidebar, and starred documents | Done |
| 9 | Colour, fonts and alignment — with export stated as lossy | Done |
| [10](docs/superpowers/specs/2026-08-17-phase-10-version-diff-design.md) | See what changed between versions | Done |
| 11 | Faster authenticated requests, and a phone-usable editor | Done |
| [12](docs/superpowers/specs/2026-08-17-phase-12-inline-images-design.md) | Images inline in the document, served from a stable URL | Done |
| [13](docs/superpowers/specs/2026-08-17-phase-13-folders-design.md) | Folders: organisation, not access | Done |
| [14](docs/superpowers/specs/2026-08-20-phase-14-comments-design.md) | Comments, anchored to a passage — and the `comment` permission finally means something | Done |
| [15](docs/superpowers/specs/2026-08-20-phase-15-notifications-design.md) | Notifications and mentions | Done |
| [16](docs/superpowers/specs/2026-08-20-phase-16-writing-tools-design.md) | Find and replace, document outline, word count, change case | Done |
| 17 | Performance: a resolved user is cached, not re-fetched on every request | Done |
| [18](docs/superpowers/specs/2026-08-20-phase-18-templates-design.md) | Duplicate a document; templates | Done |

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

- Create, rename, and edit rich-text documents — bold, italic, underline, strikethrough, inline code,
  links, headings, quotes, code blocks, rules, checklists, tables, and bulleted/numbered lists — with
  autosave. Type `/` on an empty line to insert any of them without reaching for the toolbar.
- **Find and replace** inside a document (Ctrl+F, Ctrl+H), with a match count, match-case, and
  Replace All as a single undo step.
- **Jump by heading** with the document outline, and see **word count, character count and reading
  time** — for the whole document, or for whatever is selected.
- **Change the case** of a selection: upper, lower, or Title Case that leaves the small words alone.
- **Duplicate any document you can see** — including one shared with you. The copy is yours,
  carries the content and the attachments, and leaves the shares, comments, history and stars behind.
- **Start from a template**: three built in (meeting notes, weekly update, project brief), plus any
  document of your own you mark as one.
- Import a `.txt` or `.md` file as a new document.
- Export a document as Markdown, or print it as a PDF — including documents shared with you.
- Attach files to a document — images, PDFs, and text — and download them again, when a storage
  bucket is configured. **Place an image inline** in the text, where it survives export and reload.
- Share a document by email with **view, comment or edit** access, change someone's level, or
  revoke it. The dashboard separates documents you own from documents shared with you.
- **Comment on a document, or on a passage inside it** — reply, resolve, reopen. A commenter can
  join the discussion without being able to change a word of the document.
- **Be told when it happens.** A bell in the header counts what you have not read: comments on your
  documents, replies to your threads, mentions of you, and documents shared with you. Type `@` in a
  comment to address someone who can already see the document.
- Edit a document with someone else at the same time, seeing their cursor and their text as they
  type — when a collaboration server is configured.
- Browse a document's version history, preview an earlier draft, **see exactly what changed**, and
  restore it.
- Search your documents by any word in a title or a body, including ones shared with you.
- Star any document you can see — including one shared with you — and reach it from the sidebar.
  Stars are private: starring a shared document does not star it for everyone.
- **Put your own documents in folders** and filter the dashboard to one. Folders are organisation,
  not access: filing a document changes nothing about who can read it, and deleting a folder keeps
  its documents.
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

**`npm run dev` is slow on the first visit to each page, and that is the dev server, not the app.**
Next compiles a route the first time it is requested, and the editor route is the heaviest in the
app — TipTap, ProseMirror, Yjs and every extension. Measured on this machine, cold:

| | `npm run dev` | production build |
|---|---|---|
| Sign up | 19.6s | 9.0s |
| **Open a document — first visit** | **13.3s** | **2.9s** |
| Open the same document again | 2.0s | 1.9s |

The second visit is fast in both, because by then the route is compiled. If the app feels like it
takes twenty seconds to open a document, build it and run it:

```bash
cd frontend && npm run build && npm run start
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
- `.md` files pass through a small dependency-free converter. It is **not** a full CommonMark parser,
  and it handles exactly what the editor can produce — see the table below.

### What the converters carry

Import and export are inverses, and the set is not a matter of taste: it is **every node and mark the
editor's schema permits**, which is recorded in [`editor-schema.json`](editor-schema.json) and checked
from both sides by tests. Add a TipTap extension and those tests fail until the converter is taught
what to do with it.

| | Markdown |
|---|---|
| Headings | `#`, `##`, `###` |
| Bold, italic | `**`, `*` |
| Underline | `<u>` — Markdown has no underline and the editor offers one |
| Several marks at once | Nested, e.g. `***bold italic***`, `[**a link**](url)` |
| Highlight, sub/superscript | `<mark>`, `<sub>`, `<sup>` |
| Strikethrough | `~~` |
| Inline code | `` ` `` — **contents are never escaped** |
| Code blocks | fenced, with the language preserved |
| Blockquotes | `>` |
| Lists | `-` and numbered |
| Horizontal rules | `---` |
| Line breaks | trailing `\` |
| Links | `[text](url)` |
| Checklists | `- [ ]`, `- [x]` |
| Tables | GFM pipe tables, with column alignment |

Still unsupported, in both directions: images, nested lists, lists inside quotes, and merged table
cells — GFM cannot express `colspan` at all.

**Links carry a protocol allow-list — `http`, `https`, `mailto` — enforced in the editor *and* the
importer.** This is a security boundary, not tidiness: a link is the only content type where the
author supplies something the *reader's* browser will act on, so `javascript:` in an `href` would be
script execution in the reader's session, on a document they may only be permitted to view. A `.md`
file is untrusted input, which is why the importer checks too rather than trusting the browser. A
refused link keeps its text and loses only the mark. Links render with `rel="noopener noreferrer"`.

Autolinking is off: it would turn anything URL-shaped into a link as you type and on paste, creating
links the author never asked for.

> **A bug worth recording.** Until Phase 6-i, `StarterKit` enabled blockquotes, code blocks,
> strikethrough and hard breaks — reachable by shortcut, by input rule and by paste — while the
> converter handled only headings, paragraphs and lists, and skipped everything else in silence. A
> document whose body was a quote **exported as an empty file**. The round-trip test could not catch
> it: it started from Markdown, so it only ever exercised what the *importer* could produce, and
> underline, blockquote and code blocks were invisible to it by construction. The tests now run the
> other direction too — document to Markdown and back.

## Export

The other half of the import door: **Export** in the editor header offers two formats, and is
available to anyone who can open the document, viewers included — exporting is reading.

**Markdown** downloads a `.md` file converted by the backend. The converter is the exact inverse of
the importer above and lives beside it, so exporting a document and re-importing it reproduces the
original — a round-trip test enforces that, because a converter is where quiet asymmetries live.
Two details are deliberate:

- Markdown has no underline and the editor has one, so an underlined run is emitted as `<u>text</u>`
  rather than being silently dropped.
- Markdown's own characters are escaped in text, so a paragraph mentioning `*` survives instead of
  turning into emphasis.

The filename comes from the title — spaces to hyphens, characters a filesystem would refuse removed.
A title made only of symbols falls back to `document.md` rather than producing a file called `.md`,
which browsers refuse to save.

**PDF** is your browser's print dialog, where every current OS offers *Save as PDF*. There is no PDF
library on either side. The cost is that the browser chooses the filename and output varies slightly
between browsers; what it buys is nothing added to the deployment — server-side rendering would mean
GTK system libraries for a feature most people use rarely — and output that matches what you are
looking at, because it *is* what you are looking at. A print stylesheet does the real work: the app
header, toolbar, status indicators, dialogs, and collaboration cursors all disappear, leaving the
title and the document on a white page that breaks between blocks rather than through a heading.

Exporting a specific version from history is not supported; history restores in place instead.

## Attachments

Files attached to a document, listed below the editor. Optional, and off unless the backend has
`SUPABASE_SERVICE_ROLE_KEY` set — without it the panel is absent entirely, because an unconfigured
feature is not a broken one.

| | |
|---|---|
| Types | PNG, JPEG, GIF, WebP, PDF, `.txt`, `.md`, `.csv` |
| Maximum size | 10MB per file |
| Maximum per document | 20 |
| Upload, remove | Requires **edit** permission |
| List, download | Requires **view** — anyone who can read the document |

**SVG is deliberately not allowed**, despite being an image: it is a document format that can carry
script, and attachments are served from a URL the user is invited to open. Nothing else on the list
can execute.

The **content type comes from the file's extension, never from the request** — a browser-supplied
type is a claim by the uploader, and storing it unchecked would serve the bytes back under a type
they are not. The stored path contains no part of the filename either, only two ids, so a name like
`../../etc/passwd.png` cannot escape anywhere. The original name is kept in the database for display.

Uploads go through the backend, which checks permission and validates the file before forwarding it.
Downloads do not: the backend returns a **short-lived signed URL** and the browser fetches from
Supabase Storage directly, so a free-tier Python host never streams file bytes. Those URLs are minted
per download rather than with the list, because they expire.

Deleting a document does **not** delete its attachments. `DELETE /documents/{id}` is a soft delete
into the trash and is meant to be undone, so the files have to outlive it — a restore that returned a
document without its attachments would be the worse bug.

### Setting it up

One bucket per Supabase project, created once:

```bash
cd backend && .venv/Scripts/python scripts/create_storage_bucket.py
```

Then put the **service_role** key from *Project Settings → API* into `backend/.env` as
`SUPABASE_SERVICE_ROLE_KEY` and restart the backend. That key bypasses row-level security — treat it
like a database password, keep it out of git, and use your development project's key locally.

It is the backend's alone; the browser never sees it. Letting the browser upload straight to Storage
would need no key, but access would then be enforced by SQL policies on `storage.objects` — a second
implementation of Folium's ownership-and-shares rules, in another language, to keep in step by hand.
One source of truth is worth one secret.

## Live collaboration

Optional, and off unless the backend has `Y_SWEET_CONNECTION_STRING` set. With it, two people editing
one document see each other's text and cursors as they type; without it, the editor behaves exactly as
it does alone. A viewer receives a **read-only room token**, so the server itself refuses their writes
rather than trusting the browser.

Each person's caret carries their own name and a colour derived from their user id, so they are the
same colour to everyone and after a reload. The editor also says whether it is **Live**, connecting,
or offline — separately from the save indicator, because "my work is in the database" and "other
people can see it" are different questions that fail independently.

Postgres stays the record of truth: the client that made a change still saves the merged document
through the API, so version history, the dashboard, and everything else are unaffected. If everyone
closes their browser before autosave fires, the merged text lives only in the room — so when a client
next syncs and finds the room ahead of the database, it writes it back. The next person to open the
document repairs the record.

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

## Folders

Folders group **the documents you own**, and nothing else. Create one from the `+` beside **Folders**
in the sidebar; file a document with the small control on its card; click a folder to filter the
dashboard to it. **Unfiled** is the complement.

**Filing is organisation, not access.** Putting a document in a folder changes nothing about who can
read it. The alternative — a shared folder whose contents everyone sees — gives a document two
sources of truth about its permissions, its shares and its folder, and every way of resolving a
disagreement between them surprises somebody. The surprise is always "a document I thought was
private is not".

A document shared *with* you therefore has no folder control. It is not yours to file, and the
backend refuses it with a 404 — the same rule the whole app follows, so the API never confirms that
someone else's folder exists.

| | |
|---|---|
| Owner | One user, always |
| Contains | Documents that user owns |
| Nesting | None. One level |
| A document | Is in at most one folder, or none |
| Deleting a folder | Keeps its documents. They become unfiled |

**Deleting a folder does not delete its documents** (`ON DELETE SET NULL`). Reorganising should never
destroy work, and there is already a trash for deleting.

One implementation note worth knowing: filing rides on the document `PATCH` rather than earning its
own route, and `folder_id: null` means "unfile" while **omitting the key** means "leave the folder
alone". The backend tells them apart with Pydantic's `model_fields_set`. Without that, every
title-only autosave — which the editor sends constantly — would read as an unfile, and documents
would silently fall out of their folders while being typed in.

## Comments

Comment on a document, or select a passage and comment on that. Reply one level deep, resolve a
thread, reopen it. Anyone who can view a document can read its discussion; writing needs **comment**
access or better, which the share dialog now offers.

**The interesting decision is where a comment's anchor lives**, and only one answer survives the
constraint this app already had.

| | Why not |
|---|---|
| A mark in the document | Applying a mark is a **content write**, and the `comment` permission exists precisely for someone who may not write the content. Disqualifying, not merely awkward |
| Character offsets | Drift on any edit above them, continuously under live collaboration. A comment that silently points at the wrong sentence is worse than one that admits it lost its place |
| Yjs relative positions | The right tool, and unavailable: the Yjs document only exists when y-sweet is configured, and collaboration is optional here |

So an anchor is a **text quote selector** — the quoted text plus about sixty characters either side,
as in the W3C Web Annotation model. The passage is found by looking for it, scoring each occurrence
by how much of the recorded context still surrounds it, and the highlight is drawn as a ProseMirror
**decoration**: a view-layer overlay that never touches the document. Nothing about commenting writes
content, which is what makes the permission enforceable at the only place that counts.

Editing elsewhere in the document does not move a comment. Rewriting the passage itself **detaches**
it: the thread stays, quoting the text it was about, and the highlight disappears rather than
reattaching to whatever is nearest. Losing a highlight is recoverable; pointing confidently at the
wrong paragraph is not.

Two smaller rules worth knowing:

- **The owner can delete any comment and edit none.** Deleting is moderation — it is their document.
  Changing someone's words while their name stays on them is forgery, so no interface offers it.
- **A discussion outlives the account that took part in it.** `author_id` is `ON DELETE SET NULL`,
  and a comment from a deleted account renders as "Unknown" rather than vanishing.

## Notifications and mentions

A bell in the header counts what you have not read. Four things reach it, and nothing else:

| Event | Who hears |
|---|---|
| A comment on a document | Its owner |
| A reply to a thread | Whoever started the thread |
| A mention in a comment | The person mentioned |
| A document is shared with you | You |

**Never yourself.** Commenting on your own document, replying to your own thread and mentioning
yourself all produce nothing.

**One event, one notification.** A reply that also mentions the thread's author is a mention and not
both, because "Ada mentioned you" says everything "Ada replied" says and more.

Nothing is sent for edits, resolutions, deletions or filings. Each is either routine or already
known to whoever did it, and a list that fills with things nobody wanted is one people stop reading —
at which point the four that matter are lost with the rest.

**A notification never outlives the access it was created under.** The row holds a document title,
so one written while a document was shared with you and read after your share was revoked would leak
it. Every read re-checks access rather than relying on a cleanup job at revocation time, because a
cleanup job fails silently the first time someone adds another way to lose access.

Type `@` in a comment to address someone. The picker offers only people who can already see the
document — anyone else would be either a leak or a promise of a link they cannot open — and mentions
are recorded as rows rather than scraped back out of the text, because display names contain spaces
and "where does `@Ada Lovelace` end?" has no reliable answer. Delete the `@Ada` from your text before
posting and the mention goes with it.

**Delivery is polling, once a minute**, and that is a decision rather than a shortcut. The
collaboration server exists but is per-document and optional; a second realtime system would be a
second thing to operate, deploy and debug for a feature whose whole requirement is "within a minute
is fine". The count also refreshes immediately after anything that could change it, so the common
case never waits for a tick.

## Writing tools

The editor's formatting has been Word-like since Phase 9. These are the things Word gives you for
working on a document rather than a paragraph.

**Find and replace.** `Ctrl+F` to find, `Ctrl+H` to find and replace, `Enter` and `Shift+Enter` to
step through matches, `Escape` to close — or the **Find** button in the header, which is there
because nobody discovers an intercepted shortcut.

Ctrl+F is taken over deliberately, and that is a debt the feature has to repay: the browser's own
find searches only what is laid out, cannot replace, and cannot tell the editor where it landed.
Having taken the shortcut, what replaces it has to be better.

| Decision | Why |
|---|---|
| Literal matching, not regex | A find bar that accepts regex turns a stray `(` into an error the user did not ask to debug |
| Case-insensitive by default | What people mean by "find the" is almost never "find exactly lowercase the" |
| The current match is a different colour | "3 of 17" is only useful if you can see which one is 3 |
| Replace All is one undo step | Otherwise undoing a 200-match replace is 200 keystrokes |
| `0 results` rather than silence | After typing, nothing on screen is indistinguishable from a control that has stopped working |

Matches are **ProseMirror decorations** — a view-layer overlay — so searching a document cannot
change it. Only Replace writes, and only for someone who may edit: a viewer and a commenter get
find, which is the useful half.

**The outline** lists every heading and jumps to one, and hides itself entirely when the document
has none rather than promising a structure it has not got.

**Statistics** — words, characters and reading time — sit below the editor, and follow the selection
when there is one. Reading time uses 238 words per minute, from Brysbaert's 2019 meta-analysis of
silent reading rates; the number matters less than not inventing one.

**Change case** cycles a selection through upper, lower and Title Case. Title Case leaves the small
words alone except as the first or last word, so "the rise and fall of the roman empire" becomes
"The Rise and Fall of the Roman Empire" rather than the naive version with a capital And.

**Keyboard shortcuts** are listed under **Shortcuts** in the header — an editor with thirty
shortcuts and no list of them has thirty secrets.

## Performance, and where the time actually goes

Two different problems get called "the app is slow", and they have nothing to do with each other.

**The dev server.** See [Running it locally](#running-it-locally) — `next dev` compiles each route on
its first request, and the editor route takes about 13 seconds to compile. A production build has no
compile step, and the same navigation takes 2.9s.

**The database is in another region.** Every authenticated request costs a round trip to a hosted
Postgres, and that is the floor under everything. `backend/scripts/measure_endpoints.py` measures it
against the real database rather than guessing:

```bash
cd backend && ./.venv/Scripts/python.exe scripts/measure_endpoints.py
```

It reports each endpoint cold and warm, interleaved — because the network drifts, so two separate
runs are not comparable with each other.

### What the app does about it

**Resolved users are cached for a minute.** Every authenticated request has to answer "who is this",
and that was a `SELECT` on the users table — measured at **~480ms**, which was the floor for
`GET /me`, an endpoint that does nothing else. A document page makes six or seven authenticated
calls, so the app paid around three seconds of pure identity before any of them did their own work.
It is now **4ms** on a warm cache.

That is only safe because of what the cache checks. Email, display name and avatar are the only
mutable fields, and all three arrive **in the token** — so a cache hit compares them and falls
through to the database the moment they differ. What the one-minute window really bounds is a user
row deleted out from under a live session, which self-heals and is not something the app does.

**The dashboard is one request, not two.** Stars used to be fetched separately; the list carries the
flag (Phase 11).

**The mention list is fetched when you start writing a comment, not when the page loads.** Only the
mention picker reads it, and the picker cannot open until the compose box has focus — so an eager
fetch cost every reader of every document a request they would probably never make.

**Nothing polls faster than it needs to.** The notification count is asked once on load and once a
minute after that; see [Notifications](#notifications-and-mentions) for why polling rather than a
second realtime system.

### What is still slow, honestly

Roughly 600ms per endpoint, and most of that is distance. A document page still makes several calls,
each paying its own round trip to `ap-south-1`. The remaining levers are moving Postgres closer to
the backend and folding more of what one page needs into fewer responses — not more code in front of
the same queries.

## Duplication and templates

**Duplicate any document you can see**, including one shared with you. That is not a loosening of
anything: anyone who can read a document can already export it as Markdown and import the file back,
which produces a worse copy through more steps. The button removes the detour.

The copy is yours and fresh:

| Carried over | Left behind | Why |
|---|---|---|
| Title, prefixed "Copy of" | Shares | A copy is not a re-share; who sees it is the copier's decision |
| Content | Comments | A discussion is about the document it happened on |
| Attachments | Version history | The copy has no past |
| | Stars | A private bookmark, not a property of the document |
| | The template flag | A copy of a template is a document, which is the point of using one |

**Attachments are copied and the content is rewritten to point at the copies.** This is the part it
would be tempting to skip, and skipping it produces a document whose images work today and break the
moment the original is deleted or unshared — a duplicate that quietly rots, which is worse than no
duplicate. Storage copies the objects server-side, so the bytes never travel through the backend. A
file that cannot be copied is skipped rather than failing the whole duplication, and its reference is
left pointing where it already worked.

**A template is a document with a flag on it**, not a separate kind of thing. It is written in the
same editor, kept in the same list and exported the same way; the flag only says "offer this when
starting something new". Mark one with **Save as template** in its editor — owner only, because an
editor may change what a document says but whether it is offered as a starting point is the owner's
call.

**New from template** on the dashboard offers your own alongside three built-in ones — meeting
notes, weekly update, project brief. The built-ins live in the app as content rather than as rows:
they are identical for everyone and never change without a deploy, so a row per user per template
would be a migration and a seeding job to say what a constant already says.

Using a template creates the document under the template's own name, not "Copy of" — and the new
document is not itself a template, which is the entire point.

## Troubleshooting

### Everything returns 401 and the app says your session has expired

**Check the machine's clock first.** If it is more than a minute out of step with
Supabase, every token that project issues can look wrong to the machine
verifying it, and the symptom gives no hint of the cause: the sign-in succeeds,
Supabase is happy, the middleware lets you through, and then every single API
call comes back 401 with one deliberately opaque message.

```bash
cd backend && ./.venv/Scripts/python.exe scripts/diagnose_auth.py
```

That signs up a throwaway account, gets a genuine token, and runs it through the
real verifier with the reason printed — the API itself returns one identical
body for every authentication failure on purpose, so it will never tell you.

To fix the clock on Windows, from an **administrator** terminal:

```bash
w32tm /resync
```

The verifier no longer rejects a token for being issued in the future, so a
skewed clock does not lock you out any more. It is still worth fixing: `exp` is
checked against the same wrong clock, so a machine an hour behind will keep
accepting tokens for an hour after they expire.

### The first visit to a page takes 20 seconds

That is `next dev` compiling the route. See
[Running it locally](#running-it-locally) — a production build has no compile
step.

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
- **Offline edits are held but unannounced.** Yjs keeps what you type while disconnected and merges it
  on reconnect, and the editor says it is offline — but nothing tells you that those particular edits
  have not yet reached anyone else.
- **Version history is automatic, not manual.** A snapshot is kept at most every five minutes per
  author, and only the newest 50 per document, so the very last keystrokes before a mistake may not
  have their own version.
- **Markdown import and export cover what the editor can produce, and no more** — see the table under
  File import. The two match deliberately, so a round trip is lossless. Images, nested lists and
  merged table cells are unsupported in both directions.
- **A table cell holds inline text only.** GFM cannot express a list inside a cell, so cell content is
  flattened on export. This is the one place the converters knowingly lose structure, and it is why
  tables took their own phase rather than riding along with links.
- **Colour, fonts and text alignment do not survive Markdown export.** They are supported in the
  editor, and Markdown has no spelling for any of them — so the `.md` file omits them. This is a
  deliberate trade rather than a bug, and the export dialog says so **before** you press the button;
  **PDF keeps everything**, because it is the browser rendering what is on screen. The formatting is
  never lost from the document itself: TipTap JSON is the record of truth.
- **PDF export is the browser's print dialog**, so the browser chooses the filename and the output
  varies slightly between browsers. There is no server-side renderer.
- **Sharing needs an existing account.** There are no pending invitations, so sharing with an address
  that has not signed up fails rather than waiting for them.
- **An inline image is a link, not the bytes.** The document stores a stable route
  (`/attachments/{id}/raw`) that authorises the caller and redirects to a freshly-signed URL. A
  signed URL written into the content would expire and the document would rot; a public bucket would
  make every attachment readable by anyone who guessed a path. Non-image attachments remain a list
  below the editor.
- **Attachments are not versioned**, and restoring an earlier draft does not restore the files that
  were attached at the time.
- **Attachments are not scanned.** The defence is the extension allow-list, the exclusion of SVG, and
  the fact that files are served from a signed URL on a different origin.
- **Deleting a document leaves its attachments in storage**, because the delete is reversible. There
  is no permanent delete, so nothing removes them.
- **Search is lexical, not semantic.** It matches words, not meaning: searching "money" will not
  find "revenue". Worth stating, because the alternative is concluding search is broken.
- **Folders do not nest, are not shared, and hold only documents you own.** A shared folder gives a
  document two sources of truth about who may read it. One level answers the actual need and can
  become a tree later; a tree cannot become simple again.
- **A comment's anchor is a quote, not a position.** It survives edits elsewhere in the document,
  and when its own passage is rewritten the comment says so rather than reattaching to whatever text
  is nearest. See the Comments section for why every other option was worse.
- **Notifications are in-app only.** No email: it needs a sending service, deliverability,
  templates and an unsubscribe story, none of which is a notification feature — it is a mail feature
  wearing one.
- **Notifications arrive by polling, once a minute.** The collaboration server exists but is
  per-document and optional; a second realtime system would be a second thing to operate for a
  feature whose whole requirement is "within a minute is fine".
- **You can only mention people who can already see the document.** Anyone else would be either a
  leak or a promise of a link they cannot open, and the backend refuses rather than silently
  dropping the mention.
- **No per-kind preferences, digests or muting**, and nothing is sent for edits, resolutions or
  deletions — each is either routine or already known to whoever did it.
- **Find is literal and within one document.** No regex, and no find-across-documents — that is
  search, and it lives on the dashboard.
- **No footnotes, bookmarks or cross-references.** Each needs a way to name a position in a document
  durably, which is exactly the problem comments had to solve with quote anchors because there is no
  such thing here.
- **Templates have no variables or placeholders.** Something that gets filled in on use is a form
  wearing a template's clothes, and a different feature.
- **A folder cannot be duplicated**, and a duplicate carries no comments.
- **No page layout, margins, headers, footers or page numbers.** Folium documents are not paginated
  — PDF export is the browser printing a continuous page, and pretending otherwise would be a lie
  the export would then have to keep.
- **A comment cannot be reattached by hand** once its passage is gone.

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
