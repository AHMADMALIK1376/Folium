# Folium Phase 13 — Folders

**Date:** 2026-08-17
**Status:** Implemented
**Scope:** Put documents in folders, and reach them from the sidebar.

---

## 1. The shape of the decision

A folder belongs to **one person** and holds **their own** documents.

That is the whole design, and it is worth stating because the alternative is
tempting and wrong. A shared folder — one whose contents everyone sees — needs its own permission
model, and then a document has two sources of truth about who may read it: its shares, and its
folder's. When they disagree, which wins? Every answer is surprising to somebody, and the surprise is
"a document I thought was private is not".

So: folders are **organisation, not access**. Putting a document in a folder changes nothing about
who can see it. A document shared *with* you stays under "Shared with you" and cannot be filed — it
is not yours to organise, and filing it would imply a claim on it you do not have.

| | |
|---|---|
| Owner | One user, always |
| Contains | Documents that user owns |
| Nesting | **None.** One level |
| Permission | Unchanged by filing. A folder is a label, not a gate |
| A document | Is in at most one folder, or none |

**No nesting, deliberately.** A tree needs a move-into-descendant cycle check, a path renderer, a
depth limit, and a recursive delete policy. For an app whose users have tens of documents rather than
thousands, one level answers the actual need — "keep the client work separate from the personal
stuff" — at a fraction of the surface. It can become a tree later; a tree cannot become simple again.

---

## 2. Deleting a folder

Deletes the folder and **not** the documents. They return to being unfiled.

The alternative — cascading into the documents — makes a tidying action destructive, and there is
already a trash for deletion. Someone reorganising should never lose work by dragging the wrong
thing, and "delete the folder, keep the work" is the only reading that cannot cost anything.

`documents.folder_id` is therefore `ON DELETE SET NULL`, not `CASCADE`.

---

## 3. The API

```
GET    /api/v1/folders              -> [FolderOut]  (with a document count)
POST   /api/v1/folders              -> 201          { name }
PATCH  /api/v1/folders/{id}         -> 200          { name }        rename
DELETE /api/v1/folders/{id}         -> 204                          documents survive
PATCH  /api/v1/documents/{id}       -> 200          { folder_id }   file or unfile
```

Filing reuses the document PATCH rather than adding a route, because it is a property of the
document. `folder_id: null` unfiles.

**A folder id belonging to someone else is a 404**, not a 403, and not silently ignored — the same
rule the whole app follows. Filing into a stranger's folder must fail, and must not reveal that the
folder exists.

The dashboard gains `folder_id` on each document, so filing needs no second call per card.

**The folder list is a separate request, and that is a deviation from the plan.** It was going to
ride on the documents response, in the spirit of Phase 11. It cannot: the rail lives in the app
layout, so it renders on the editor page too, which never calls `/documents`. Two endpoints is the
only shape that serves both.

A dashboard render therefore makes three calls — documents, and folders twice, once for the layout's
rail and once for the page's heading and folder controls. React's `cache()` would collapse the pair,
but it is a Server Component API this React build does not export, and importing it takes
`server.test.ts` down at module load. The duplicate costs no wall-clock time — Next renders the
layout and the page concurrently, and the page runs its two fetches in a `Promise.all`, so all three
are in flight together — but it is one more query than the plan called for.

---

## 4. The interface

Folders appear in the sidebar under the fixed sections, each with its count. Selecting one filters
the dashboard to it. A document's card gains a small folder control to file it.

| Situation | Behaviour |
|---|---|
| No folders yet | The heading stays, with one line explaining what folders are — **changed from the plan**: hiding the section hides the only way to create the first folder |
| A folder with nothing in it | Still listed — it was created deliberately |
| A shared document | No folder control. It is not yours to file |
| Deleting a folder | Confirms, and says the documents will be kept |

---

## 5. Testing

| Layer | Coverage |
|---|---|
| Backend | Create, rename, delete, list with counts; deleting keeps the documents; filing into another person's folder is 404; a name is required and bounded |
| Backend | Filing and unfiling through the document PATCH; a shared document cannot be filed by the person it is shared with |
| Frontend | The sidebar lists folders with counts; selecting filters; a shared document has no folder control |
| End to end | Create a folder, file a document, see it filtered, delete the folder and find the document still there |

---

## 6. Out of scope

- Nested folders, shared folders, folder colours or icons.
- Drag and drop. A select is keyboard-accessible and does not need a second implementation for touch.
- Filing documents shared with you.

---

## 7. Definition of done

- [x] A folder can be created, renamed, deleted, and holds a count
- [x] Deleting a folder keeps its documents, unfiled
- [x] A document can be filed and unfiled; only its owner may file it
- [x] Another person's folder id is a 404, never silently accepted
- [x] The sidebar lists folders and filtering works
- [ ] ~~The dashboard still loads in one request~~ — not met, and could not be. See §3: the
      rail is part of the layout, so the folder list is its own endpoint. Three concurrent
      requests, no added latency.
- [x] Backend, Vitest and Playwright pass
