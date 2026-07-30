# Folium Phase 2C-ii — The editor on FastAPI

**Date:** 2026-07-30
**Status:** Approved, not yet implemented
**Scope:** Open a document, edit it, rename it, and autosave as TipTap JSON — plus closing the stale-cache finding deferred from 2C-i.

---

## 1. Context

2C-i put the document *list* on the new stack: sign in, see what you own and what is shared with you,
create, delete, restore. But every title on that dashboard links to `/documents/{id}`, which
middleware still returns 404 for, because the page behind it is the v1 editor. So the dashboard today
loads perfectly and every link on it dead-ends.

2C-ii is the phase that makes Folium usable again.

| | Deliverable | Status |
|---|---|---|
| 2C-i | Dashboard and trash, reading from FastAPI. | Done |
| **2C-ii** | **This spec.** The editor: open, edit, rename, autosave as TipTap JSON. | This phase |
| 2C-iii | Sharing with permission levels, file import, and deleting all v1 code. | After |

### The backend needs no changes

Unlike 2C-i, this phase is frontend-only. The endpoints already exist and already do the right thing:

| | |
|---|---|
| `GET /api/v1/documents/{id}` | Returns `DocumentOut`: `content` (TipTap JSON), `permission` (`owner`/`edit`/`comment`/`view`), and the owner's profile. 404 for both "no such document" and "not allowed", so it cannot be used to enumerate documents. |
| `PATCH /api/v1/documents/{id}` | Accepts `{title?, content?}`, validates that `content` really is a TipTap `doc` node tree, rejects a blank title, refreshes `content_text` for future search, and raises 404 unless the caller `can_edit`. |

Two things follow from that and shape the whole phase. The backend validates content structurally, so
sending `editor.getHTML()` would be rejected outright — JSON is not optional. And it enforces
permission on write, so a read-only user who is *offered* an editor gets a 404 they cannot act on;
the UI has to know not to offer it.

### Decisions carried in from brainstorming

1. **Autosave, debounced, with a flush on unload.** No Save button — v1 saved automatically and
   losing that would be a regression.
2. **`fetch(..., { keepalive: true })`, not `navigator.sendBeacon`.** v1 flushed the last edit with
   `sendBeacon` because its auth was a cookie the browser attached for free. Every v2 request needs
   an `Authorization: Bearer` header, and `sendBeacon` cannot set headers. `keepalive` can, and
   survives the page being torn down. This is the single most likely thing to be "ported" wrongly
   from v1.
3. **The stale-cache guard moves into the layout.** Deferred from 2C-i and now fixed, because the
   editor makes it materially worse: `/account` leaked a profile, a document leaks its contents.

---

## 2. The stale-cache finding, closed

`/account` carries this guard, and the 2C-i review flagged that the dashboard and trash never got it:

```ts
const onPageShow = (event: PageTransitionEvent) => {
  if (event.persisted) window.location.reload();
};
```

`cache: "no-store"` in the server API client correctly opts out of Next's Data Cache and forces
dynamic rendering. Neither of the two caches that matter here is that one:

- **bfcache** restores the entire JS heap on Back, with no network request and without re-running
  effects. A signed-out user pressing Back reads the previous render off the screen.
- **The client Router Cache** can serve a previously fetched RSC payload for a route within the same
  tab, so a sign-out followed by a different sign-in can paint the first user's documents before the
  fresh payload lands.

Rather than repeat the effect in four pages, one client component renders in `(app)/layout.tsx` and
covers everything inside the group — dashboard, trash, account, and the editor. `/account` drops its
own copy, so there is exactly one implementation. `persisted` is true only for a bfcache restore, so
an ordinary navigation pays nothing.

This is a real leak, not a theoretical one, and it belongs in the phase that adds a page displaying
document contents.

---

## 3. The route

```
src/app/(app)/documents/[id]/page.tsx     Server Component: fetch, then hand off
src/components/editor/
  DocumentEditor.tsx      client: TipTap, toolbar, autosave, title
  EditorToolbar.tsx       formatting controls
  SaveStatus.tsx          saved / saving / unsaved / failed
```

`middleware.ts` moves `/documents` out of `RETIRED` and into `PROTECTED`. `RETIRED` keeps `/api/`:
those v1 routes still mint passwordless sessions and must stay 404'd until 2C-iii deletes them.

The v1 page at `src/app/documents/[id]/page.tsx` is **deleted**, for the same reason
`src/app/dashboard/page.tsx` was in 2C-i — two files cannot serve one route. Its components
(`DocumentEditorShell`, `Editor`, `ShareModal`, `TopBar`) stay in the tree, now unreferenced, until
2C-iii. No other v1 file is touched.

### Server-rendered read, client-side writes

Same split as 2C-i, for the same reason. The page is a Server Component calling `getDocument(id)`
through the existing `serverApiFetch`, so the document arrives in the HTML with no loading flash and
no token in client-visible state. Editing is a Client Component that PATCHes through the browser
`apiFetch`.

The editor does **not** `router.refresh()` after each save. 2C-i's mutations refreshed because the
server owned the list; here the client owns the text the user is typing, and re-running the server
render mid-keystroke would fight the editor for control of its own content. The dashboard picks up
the new title on its next visit, which is a fresh server render anyway.

### When the fetch fails

| Situation | Behaviour |
|---|---|
| 404 | "This document does not exist, or you do not have access to it", with a link back to the dashboard. **One message for both cases** — the backend deliberately conflates them, and a UI that distinguished them would re-open the enumeration hole the backend closed. |
| 401 | The `ApiErrorMessage` sign-in link, as everywhere else. Never an automatic redirect: middleware already judged the caller authenticated, so a redirect would loop. |
| 503 | "Temporarily unavailable", distinct from an auth failure — the distinction 2A built. |

A document deleted while open behaves the same as any other 404 on the next save: the message
appears, the editor stays on screen, and the user's text is still in front of them rather than
discarded.

---

## 4. Editing

### TipTap, configured for the App Router

`StarterKit` plus `Underline`, matching the marks v1 supported and the ones the import converter
already produces. Two settings are load-bearing:

- **`immediatelyRender: false`.** TipTap renders synchronously by default, which produces markup on
  the server that cannot match the client and trips a hydration error. Every editor in a Next.js
  Server Component tree needs this.
- **`content` seeded from the fetched JSON, once.** The editor is the source of truth for its own
  document from mount onward; re-seeding it from props on re-render would move the caret.

### Autosave

| | |
|---|---|
| Trigger | TipTap's `onUpdate`, and the title input's `onChange` |
| Debounce | 800ms after the last change — v1's interval, which felt right and is well short of losing a paragraph |
| Request | `PATCH /api/v1/documents/{id}` with only what changed |
| Flush | On `visibilitychange` → hidden and on `beforeunload`, if a save is pending: the same PATCH with `keepalive: true` |
| Status | A live region reading `Saved` / `Saving…` / `Unsaved changes` / a failure message |

Failures do not silently retry forever. The status says the save failed and the next edit tries
again — the user is never told their work is safe when it is not, which is the one thing an autosaved
editor must get right.

Concurrent editing is still last-write-wins: two people in one document overwrite each other, exactly
as in v1. Live collaboration is Phase 4. This phase must not pretend otherwise — no presence
indicators, no "someone else is editing" that isn't real.

### Renaming

The title is an input in the editor header, autosaved on the same debounce. Blank is not a valid
title — the backend rejects it — so an empty input reverts to the last saved title on blur rather
than sending a request that will 422.

### Read-only

`permission` is `view` or `comment` → the editor mounts non-editable, the toolbar is not rendered,
the title is plain text rather than an input, and a banner says the document is read-only. `comment`
gets the same treatment as `view` this phase; commenting itself is not built, and offering a comment
UI that cannot save would be worse than not offering it.

This is a UI courtesy, not the security boundary. The backend 404s a PATCH from a non-editor whatever
the client does.

---

## 5. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Frontend unit | Vitest | The debounce coalesces bursts into one PATCH; a failed save surfaces and does not claim success; the flush fires on `visibilitychange`; a blank title never reaches the API |
| Frontend component | Vitest + RTL | Read-only permission renders no toolbar and no title input; the 404 message covers both "missing" and "forbidden"; the stale-cache guard reloads on a bfcache restore and not on a normal load |
| End-to-end | Playwright | Create a document, open it, type, watch it save, reload and find the text still there; rename it and see the new title on the dashboard |

TipTap runs ProseMirror, which needs DOM APIs jsdom lacks. Unit tests therefore mock `@tiptap/react`
and exercise the autosave and permission logic directly; the real editor is proven in a real browser
by Playwright. That division is deliberate — a jsdom test that "renders" a mocked ProseMirror proves
nothing about editing.

The Playwright case that matters is **reload and find the text still there**. It is the only test
that proves the round trip: TipTap JSON out of the browser, through the token check, into `jsonb`,
and back into a server-rendered editor.

---

## 6. Out of scope

- Sharing UI and permission management — 2C-iii. Read-only mode is built now because the backend can
  already return a `view` permission, but nothing in this phase can create one through the UI.
- File import — 2C-iii.
- Deleting v1 components, API routes, `db.ts`, `repo.ts`, or SQLite — 2C-iii. Only the one colliding
  page file goes.
- Live collaboration, presence, and multi-cursor — Phase 4.
- Version history and restore — the `document_versions` table in the foundation spec is a later
  phase; nothing here writes snapshots.
- Comments, as distinct from the `comment` permission level.
- Images, tables, code blocks, and links. v1 supported none of them and the import converter produces
  none.
- Offline editing and conflict resolution.

---

## 7. Definition of done

- [ ] `/documents/{id}` opens a document server-rendered, with its title and content already in the HTML
- [ ] Typing autosaves as TipTap JSON, and a reload shows the saved text
- [ ] A burst of typing produces one save, not one per keystroke
- [ ] Leaving the page with an edit pending still saves it
- [ ] A failed save says so, and never reads as "Saved"
- [ ] Renaming from the editor shows the new title on the dashboard
- [ ] A blank title is never sent to the API
- [ ] A read-only document offers no toolbar and no editable title
- [ ] A missing document and a forbidden one produce the identical message
- [ ] 401 and 503 stay visibly distinguishable, as in every other phase
- [ ] Back after signing out never shows the previous session's documents or contents
- [ ] Every dashboard link now resolves — no route in the app returns a bare 404 to a signed-in user
- [ ] Backend suite, Vitest, v1 suite, and Playwright all pass; Playwright passes twice in a row
- [ ] No v1 file deleted except `src/app/documents/[id]/page.tsx`
