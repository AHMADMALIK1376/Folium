# Folium Phase 2C-iii — Sharing, import, and retiring v1

**Date:** 2026-07-30
**Status:** Approved, not yet implemented
**Scope:** Share a document with permission levels, import a `.txt`/`.md` file, and delete the v1 application.

---

## 1. Context

2C-i put the document list on the new stack and 2C-ii put the editor there. Two features from v1 are
still missing, and the v1 code they came from is still in the tree — compiled, unreferenced, and
firewalled behind a 404.

This phase finishes the cut-over.

| | Deliverable | Status |
|---|---|---|
| 2C-i | Dashboard and trash, reading from FastAPI. | Done |
| 2C-ii | The editor: open, edit, rename, autosave as TipTap JSON. | Done |
| **2C-iii** | **This spec.** Sharing with permission levels, file import, and deleting all v1 code. | This phase |

### The backend is again complete

| | |
|---|---|
| `GET /api/v1/documents/{id}/shares` | Anyone who can view the document sees who it is shared with. |
| `POST .../shares` | Owner only. `{email, permission}`. 422 `"No user with that email"` if the address has no account; 422 `"You already own this document"` for self-sharing. Re-sharing an existing collaborator updates their level rather than erroring. |
| `PATCH .../shares/{user_id}` | Owner only. Changes a level. 204. |
| `DELETE .../shares/{user_id}` | Owner only. 204, and idempotent — deleting a share that is already gone succeeds. |
| `POST /api/v1/documents/import` | Multipart. `.txt`/`.md`/`.markdown` only, 2MB cap, UTF-8, converts to TipTap JSON and creates the document. |

Non-owners get 404 from every mutating share route, not 403 — the project's rule that
access-denied and does-not-exist stay indistinguishable.

---

## 2. Sharing

### Where it lives

A dialog opened from the editor header, owner only — where v1 put it, and where the person who knows
what the document is makes the decision. The dashboard card does not get a Share button: the list is
for finding a document, not administering it.

The dialog shows current collaborators with their permission, a control to change each, a control to
remove each, and a form to add one by email address.

### Only view and edit can be granted

The backend accepts three levels. The dialog offers two.

`comment` is real in the data model and 2C-ii renders it as read-only, because commenting is not
built. Offering it in the dropdown would let an owner grant a capability that does not exist, and the
collaborator would find a document they cannot comment on and cannot edit either. So: an existing
`comment` share is **displayed** faithfully, and may be changed to view or edit, but a new one cannot
be created. When commenting ships, the option appears with the feature.

### Sharing reveals whether an email has an account

`POST .../shares` answers 422 `"No user with that email"`, and the dialog shows that, because an owner
who mistypes an address needs to know the share did not happen. This does mean an authenticated user
can probe whether any given address has a Folium account.

That is a deliberate trade-off, and it is worth naming because this project is otherwise strict about
the opposite: login and sign-up go to real lengths not to reveal whether an account exists. The
difference is that those endpoints are unauthenticated and are the front door for credential
stuffing, whereas this one requires an account and a document. The alternative that keeps the secret
is pending invitations — share to an address, and the grant activates if and when that person signs
up — which is a backend feature this phase is not building. Recorded as a known trade-off rather than
quietly accepted.

### Errors

| Situation | Behaviour |
|---|---|
| 422 | Show the backend's `detail`. It is the one case where the server's own words are the right ones: "No user with that email" and "You already own this document" are both actionable and specific. |
| 404 on a mutation | The document or share vanished under the dialog. Say the document is no longer available and link to the dashboard, rather than reporting a share problem. |
| 401 / 503 | The shared `ApiErrorMessage` treatment, unchanged from every other phase. |
| Removing a share that is already gone | Success. The backend is idempotent and the owner's intent is satisfied. |

### The empty shared list

2C-i left a finding open: the dashboard's "Shared with you" section renders nothing at all when
empty — no heading, no message — so a new user gets no hint that sharing exists. Now that sharing is
reachable, that section gets an empty state explaining that documents other people share appear
there.

---

## 3. Import

A control on the dashboard beside **New document**: pick a `.txt` or `.md` file, and it becomes a new
document. The same limits as v1 and as the backend enforces — `.txt`, `.md`, `.markdown`, 2MB, UTF-8
— checked client-side for a fast, clear rejection and enforced server-side because the client cannot
be trusted.

After a successful import the browser navigates to the new document, because a file just imported is
a thing you want to look at. That differs from **New document**, which stays on the dashboard.

### `apiFetch` has to stop forcing JSON

`apiFetch` sets `Content-Type: application/json` on every request. A multipart upload must not carry
that header: the browser generates the `multipart/form-data` value including a boundary parameter, and
a hardcoded JSON header makes FastAPI reject the body.

So `apiFetch` gains one rule: when the body is a `FormData`, do not set `Content-Type` and let the
browser do it. This is a change to the file every authenticated request in the app goes through, so
it comes with tests of its own and must leave the JSON path byte-identical.

### The v1 converter is not reused

v1 converted Markdown to HTML in the browser (`src/lib/importFile.ts`). The backend converts to
TipTap JSON in Python (`app/utils/import_file.py`, 15 tests). Content is JSON now, so the browser
converter is not a starting point for anything — the frontend uploads the raw file and the backend
owns the conversion. The v1 converter and its 4 tests are deleted, not ported.

---

## 4. Deleting v1

Nothing in the current application imports any of it — verified by grep, not assumed.

```
frontend/src/app/api/**            7 v1 route handlers
frontend/src/lib/db.ts             node:sqlite connection
frontend/src/lib/repo.ts           v1 data access
frontend/src/lib/auth.ts           v1 passwordless session
frontend/src/lib/types.ts          v1 types
frontend/src/lib/importFile.ts     v1 HTML converter
frontend/src/lib/validation.ts     v1 zod schemas
frontend/src/components/           DashboardActions, DocumentCard, DocumentEditorShell,
                                   Editor, LoginOptions, ShareModal, TopBar
frontend/test/                     3 files, 14 node:test tests
```

`middleware.ts` loses its `RETIRED` list entirely — there is nothing left to deny. `package.json`
loses the `test` script and the `node:sqlite` note on `engines`. `data/app.sqlite` is gitignored and
local only; the README says how to remove it.

### What the 14 deleted tests covered, and where that coverage now lives

Deleting tests deserves an accounting rather than a shrug:

| v1 test file | Covered | Now covered by |
|---|---|---|
| `access-control.test.ts` | owner / shared / denied access to a document | `backend/tests/test_permissions.py` and `test_documents_api.py` |
| `import.test.ts` | `.md`→HTML and `.txt` conversion, title from filename | `backend/tests/test_import_file.py` (15 tests, against the JSON converter that replaced it) |
| `validation.test.ts` | v1 request schemas | `backend/tests/test_schemas.py`, plus Vitest on the new zod schemas |

Every behaviour keeps a test. What changes is that the tests now live beside the code that implements
it, which is the backend.

### CI runs the wrong test suite

Retiring v1 exposes something that has been wrong since Phase 2B: `.github/workflows/frontend.yml`
runs `npm test` — the v1 `node --test` suite — and **never runs `npm run test:unit`**. The 87 Vitest
tests written across 2B, 2C-i, and 2C-ii have never run in CI.

Deleting `npm test` would leave CI running no frontend tests at all, so this phase changes that step
to `npm run test:unit`. Playwright stays out of CI, unchanged and for the documented reason: CI holds
no Supabase credentials.

---

## 5. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Frontend unit | Vitest | `apiFetch` omits `Content-Type` for `FormData` and still sets it for JSON; the share fetchers hit the right paths; a rejected file type never reaches the network |
| Frontend component | Vitest + RTL | The dialog lists collaborators; adding surfaces a 422's detail verbatim; `comment` is displayed but not offered; removing is optimistic-free and refreshes; a non-owner sees no Share button |
| End-to-end | Playwright | Import a `.md` file and find its headings in the editor; two accounts, one document: owner shares with view, collaborator sees it read-only, owner upgrades to edit, collaborator can then type |
| Regression | all | The suites that replaced the v1 tests still pass with v1 gone |

The two-account Playwright case is the one that could not be written before this phase: until now
nothing in the UI could create a `view` permission, so 2C-ii's read-only editor was proven only by
unit tests. This closes that.

---

## 6. Out of scope

- Pending invitations for addresses without an account.
- Comments themselves, and therefore granting the `comment` level.
- Public or link-based sharing, and transferring ownership.
- Live collaboration, presence, multi-cursor — Phase 4.
- Version history and restore.
- Importing `.docx`, `.pdf`, or HTML; images and attachments.
- Emptying the trash permanently.
- Search, sort, pagination, folders, tags.

---

## 7. Definition of done

- [ ] An owner can share a document by email with view or edit, and see who it is shared with
- [ ] An owner can change a collaborator's level and remove them
- [ ] A non-owner sees no Share control
- [ ] An existing `comment` share is displayed accurately, and cannot be newly granted
- [ ] A mistyped email produces the backend's own message, not a generic failure
- [ ] Removing an already-removed share reads as success
- [ ] The dashboard's "Shared with you" section explains itself when empty
- [ ] Importing a `.md` file creates a document with its headings and lists intact, and opens it
- [ ] A rejected file type or oversized file is refused before any upload starts
- [ ] `apiFetch` sends multipart without a hardcoded `Content-Type`, and JSON exactly as before
- [ ] No v1 file remains: no `src/app/api/**`, no `db.ts`, `repo.ts`, `auth.ts`, `types.ts`, `importFile.ts`, `validation.ts`, no v1 components, no `test/`
- [ ] `middleware.ts` has no `RETIRED` list, because there is nothing left to retire
- [ ] CI runs `npm run test:unit`, and no longer runs a suite that no longer exists
- [ ] Two accounts prove view-only and then edit access end to end, in a real browser
- [ ] Backend 158, Vitest green, Playwright green twice in a row; ruff, tsc, and build clean
