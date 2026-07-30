# Folium Phase 2C-i — Dashboard on FastAPI

**Date:** 2026-07-28
**Status:** Approved, not yet implemented
**Scope:** A server-rendered dashboard and trash view reading from the FastAPI backend, plus the one backend endpoint they need.

---

## 1. Context

Phase 2B built real authentication and an `/account` page proving the browser, Supabase, and FastAPI
agree on identity. But the actual product — documents — still lives in the retired v1 app, which
Phase 2B firewalled off behind a 404 because its login route minted sessions with no password.

So today Folium can authenticate a user and show them nothing.

Phase 2C moves the product itself onto the new stack. It is split three ways because the surfaces
are independent and each ships something usable:

| | Deliverable | Status |
|---|---|---|
| **2C-i** | **This spec.** Dashboard and trash, reading from FastAPI. | This phase |
| 2C-ii | The editor: open a document, edit it, autosave as TipTap JSON. | Next |
| 2C-iii | Sharing with permission levels, file import, and deleting all v1 code. | After |

### What 2C-i delivers

You sign in and see your documents — the ones you own and the ones shared with you — rendered from
the FastAPI backend. You can create a document, delete it with a confirmation, and restore it from a
trash view. Editing its contents is 2C-ii.

### Decisions carried in from brainstorming

1. **The document list is server-rendered.** The HTML arrives with the documents already in it, so
   there is no loading flash. This is the pattern Next.js exists for, and the reason the project
   chose it over plain React.
2. **Deleting asks first, and is reversible.** A confirmation dialog, then the document moves to a
   trash view where it can be restored. The backend already soft-deletes rather than destroying.

---

## 2. The backend gains one endpoint

Unlike 2A and 2B, this phase changes the backend. It has to.

`GET /api/v1/documents` filters deleted documents out of both the owned and shared queries, and
**nothing lists them**. The backend can soft-delete and restore, but cannot report what is in the
bin — so a trash view is impossible without a new endpoint.

```
GET /api/v1/documents/trash  ->  list[DocumentSummary]
```

Returns the caller's soft-deleted documents, **owner-only**. A user who merely had a document shared
with them must not see it in their trash: they cannot restore it, and its presence there would imply
a claim over it they do not have.

### Route ordering here is load-bearing

This endpoint must be registered **before** `/documents/{document_id}`.

Both are `GET` under `/documents`, so `GET /documents/trash` genuinely matches the dynamic route with
`document_id = "trash"`, which then fails UUID parsing and returns 422. This differs from the
`/documents/import` case in Phase 1, where the ordering turned out to be moot because that route is a
`POST` and no bare `POST /documents/{id}` exists. Here the conflict is real, and a test must cover
it — otherwise a later refactor that reorders the routers breaks trash silently.

---

## 3. Server-side rendering

### A second API client

`src/lib/api/client.ts` reads the access token from the Supabase **browser** session. Server
Components have no browser session, so they need `src/lib/api/server.ts`, which reads the token from
cookies via the server Supabase client.

Both attach `Authorization: Bearer <token>` and both raise the same `ApiError` carrying an HTTP
status, so callers handle failures identically regardless of where they run.

### Why the server client uses `getSession()`

Every other part of this codebase uses `getUser()` and documents why: `getSession()` only decodes a
cookie the client could have forged, so it must never gate access.

That rule still holds, and this is not an exception to it. This is not an access decision. Middleware
has already established the caller is authenticated, using `getUser()`. Here we need only the raw
token to forward, and the **backend independently verifies it** against Supabase's published keys
before answering — an unverified or forged token gets a 401 from FastAPI, not data. `getUser()` would
cost a network round-trip and return no token at all.

This reasoning belongs in a comment in the file, because a reviewer who knows the rule but not the
distinction will otherwise read it as a defect.

### Reads on the server, writes in the browser

Creating, deleting, and restoring are Client Components using the existing browser `apiFetch`,
followed by `router.refresh()` to re-run the server render and pull fresh data.

This is the standard Next.js pairing — server for reads, client for writes, refresh to reconcile —
and it avoids maintaining a second copy of the list in client state that could drift from the server's
view.

---

## 4. Routes and components

Both pages live inside the existing `(app)` route group, so they inherit its header and, critically,
the middleware auth guard.

```
src/app/(app)/
  dashboard/page.tsx     owned + shared documents, create, delete
  trash/page.tsx         soft-deleted documents, restore

src/components/documents/
  DocumentCard.tsx           one document: title, updated date, actions
  DocumentList.tsx           a titled section with an empty state
  CreateDocumentButton.tsx   creates, then navigates to the new document
  DeleteDocumentDialog.tsx   confirmation naming the document
  RestoreDocumentButton.tsx
```

`middleware.ts` gains `/dashboard` and `/trash` to its protected list. Note that `/dashboard` is
currently in the **retired** deny-list from Phase 2B, returning 404 — 2C-i moves it from denied to
protected, and the v1 page at `src/app/dashboard/page.tsx` is deleted so the new route group serves
it instead.

`/account` gains a link to the dashboard, and the header links to both.

### The dashboard becomes where signing in lands

Phase 2B sent every authenticated user to `/account`, because it was the only page that existed. Now
that documents have a home, a profile page is the wrong front door.

Three things move from `/account` to `/dashboard`: `DEFAULT_REDIRECT` in
`src/lib/auth/redirect.ts`, the signed-in branch of the root redirect in `src/app/page.tsx`, and the
header's logo link. `/account` stays reachable and unchanged — it simply stops being the destination.

`safeRedirect` keeps working untouched: it validates that a `redirectTo` is a same-origin path and
falls back to the default, so only the default itself changes. The Phase 2B test asserting that an
off-origin `redirectTo` is ignored must be updated to expect `/dashboard`, and it must still assert
the *rejection* — the point of that test is the open-redirect guard, not the destination.

### Empty states

A user with no documents sees an explicit prompt to create one, not a blank page. An empty trash says
so. Both are the first thing a new user meets, so neither may look like a failure to load.

---

## 5. Error handling

| Situation | Behaviour |
|---|---|
| Server fetch returns 401 | Render a message with a sign-in link — deliberately **not** an automatic redirect. Middleware has already judged the caller authenticated, so bouncing to `/login` would let middleware send them straight back to the dashboard, and the two would loop. A link puts the user in control of a disagreement the app cannot resolve on its own. |
| Server fetch returns 503 | Render an explicit "temporarily unavailable" message, distinct from an auth failure — the distinction 2A deliberately built. |
| Server fetch fails otherwise | Render an error state with a retry link, never a blank page or a crash. |
| A mutation fails | Inline message beside the action, in `carmine-700` with an icon. The list is not optimistically updated, so nothing to roll back. |
| Deleting a document that is already gone | The backend returns 404. Treated as success — the user's intent is satisfied, and surfacing an error for "it was already deleted" is noise. |

A document shared with you and then deleted by its owner simply stops appearing after the next
refresh. Opening one directly returns 404, which 2C-ii handles when the editor exists.

---

## 6. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Backend unit | pytest | `list_trash` returns only the caller's deleted documents; a shared user sees nothing |
| Backend API | pytest + httpx | `GET /documents/trash` returns 200 with deleted documents only; **`/documents/trash` resolves to the trash route, not the dynamic id route**; unauthenticated is 401 |
| Frontend unit | Vitest | The server API client attaches the token and raises typed errors |
| Frontend component | Vitest + RTL | The delete dialog requires confirmation; empty states render; mutation errors display |
| End-to-end | Playwright | Create a document, see it listed, delete it, find it in trash, restore it, see it listed again |

The Playwright case is the one that matters most: it is the only test exercising server rendering,
the mutation, and `router.refresh()` together. Phase 2B proved the point — a misplaced middleware file
passed type-checking, the build, and 36 unit tests while the route guard was entirely inactive. Only
a real browser caught it.

Every new test must use per-run unique data, as the existing suites do.

---

## 7. Out of scope

- Editing document contents — 2C-ii.
- Sharing UI, permission levels, and file import — 2C-iii.
- Deleting the v1 API routes, `db.ts`, `repo.ts`, or SQLite — 2C-iii, once nothing depends on them.
- Renaming a document. It belongs with the editor, where the title is edited in place.
- Search, sort, pagination, folders, and tags. The backend has no support and there is no volume to
  justify them yet.
- Permanently emptying the trash. Restore is the point; a purge endpoint can come with real usage.

---

## 8. Definition of done

- [ ] `GET /api/v1/documents/trash` returns only the caller's own soft-deleted documents
- [ ] A user shared into a document never sees it in their trash
- [ ] `/documents/trash` resolves to the trash endpoint, proven by a test, not by route order alone
- [ ] The dashboard renders owned and shared documents server-side, with no loading flash
- [ ] Creating a document adds it to the list without a manual reload
- [ ] Deleting requires confirmation and moves the document to trash
- [ ] Restoring returns it to the dashboard
- [ ] Empty dashboard and empty trash both render a clear prompt, not a blank page
- [ ] A 503 from the backend reads differently from an expired session
- [ ] `/dashboard` and `/trash` redirect to `/login` when signed out
- [ ] Signing in lands on `/dashboard`, and the Phase 2B open-redirect test still rejects an off-origin `redirectTo`
- [ ] Backend suite, Vitest, and Playwright all pass; Playwright passes twice in a row
- [ ] No v1 files deleted yet — that is 2C-iii
