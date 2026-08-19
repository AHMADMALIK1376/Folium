# Folium Phase 14 — Comments

**Date:** 2026-08-20
**Status:** Implemented
**Scope:** Make the `comment` permission mean something. Comment on a document, and on a passage
inside it, without being able to change a word of it.

---

## 1. Why this is the interesting one

The `comment` level had existed in `document_shares` since Phase 1 and never did anything. The share
dialog did not even offer it — `GrantablePermission` was `view | edit`, with a comment in the type
saying why: granting a capability that does not exist would leave a collaborator with a document they
can neither comment on nor edit.

Building it is not mostly about comments. It is about **where a comment's anchor lives**, and that
question has exactly one answer that survives the constraint this app already has.

---

## 2. The anchor

A comment points at a passage of text. That passage moves as the document is edited. Three ways to
hold on to it:

| | Why not |
|---|---|
| **A mark in the document content** (a `comment` mark carrying an id) | Applying a mark is a **content write**. The entire point of the `comment` permission is a person who may not write the content. A commenter would need exactly the capability they are denied. This is disqualifying, not merely awkward |
| **Character offsets** (`from`, `to`) | Drift on any edit above them, and under live collaboration they drift continuously. A comment that silently points at the wrong sentence is worse than one that admits it lost its place |
| **Yjs relative positions** | Genuinely the right tool — and unavailable. The Yjs document only exists when y-sweet is configured, and collaboration is **optional** here. An anchor that works only in a configured deployment breaks in the default one |

So the anchor is a **text quote selector**, as in the W3C Web Annotation model: the quoted text,
plus a little of what came before and after it to tell repeated phrases apart.

```
quote   "the budget constraint"
prefix  "…honest about "
suffix  " and what it cost…"
```

On load the client finds the quote in the document and draws the highlight as a **ProseMirror
decoration** — a view-layer overlay that never touches the document. Nothing about commenting writes
content, so `comment` permission is enforceable at the only place that matters: the content write it
never performs.

When the quote can no longer be found — someone rewrote the sentence — the comment does not
disappear and does not silently reattach somewhere plausible. It is shown as **detached**, with the
text it was about, in the panel. Losing the highlight is recoverable; pointing confidently at the
wrong paragraph is not.

A comment with no quote at all is a comment on **the document as a whole**. That is a real thing
people want and it costs one nullable column.

---

## 3. The data model

One table.

```
comments
  id           uuid  pk
  document_id  uuid  -> documents(id)  ON DELETE CASCADE
  author_id    uuid  -> users(id)      ON DELETE SET NULL
  parent_id    uuid  -> comments(id)   ON DELETE CASCADE   null for a thread root
  body         text                                        1..5000 chars
  quote        text  null                                  null = on the whole document
  prefix       text  null
  suffix       text  null
  resolved_at  timestamptz null
  resolved_by  uuid  null -> users(id) ON DELETE SET NULL
  created_at   timestamptz
  updated_at   timestamptz
```

**`author_id` is SET NULL, not CASCADE.** The same rule `document_versions.created_by` follows: a
discussion outlives the account that took part in it, and deleting a person should not silently
rewrite a conversation other people are still reading. The author renders as "Unknown".

**`parent_id` is CASCADE, and replies are one level deep.** A reply without the comment it answers is
meaningless, which is exactly the case where cascading is right — the opposite of folders, where
deleting the folder must keep the documents. One level for the same reason folders do not nest: a
tree needs rules nothing here needs.

A reply carries no quote and cannot be resolved on its own. **Resolving is a property of the
thread**, and the thread is its root.

---

## 4. Who may do what

`resolve_permission` and `can_view` / `can_edit` already exist. This adds `can_comment`.

| Action | Who |
|---|---|
| Read comments | Anyone who can view the document |
| Write a comment or a reply | `comment`, `edit`, `owner` |
| Edit a comment's body | Its author, and nobody else — not even the document owner |
| Delete a comment | Its author, or the document owner |
| Resolve / reopen a thread | Anyone who may comment |

**The document owner may delete a comment but not edit one.** Deleting is moderation — it is their
document. Editing someone's words while leaving their name on them is not moderation, it is
forgery, and no interface should make it possible.

---

## 5. The API

```
GET    /api/v1/documents/{id}/comments               -> threads, each with its replies
POST   /api/v1/documents/{id}/comments               -> 201  { body, quote?, prefix?, suffix?, parent_id? }
PATCH  /api/v1/documents/{id}/comments/{comment_id}  -> 200  { body?, resolved? }
DELETE /api/v1/documents/{id}/comments/{comment_id}  -> 204  cascades to replies
```

Every route is nested under its document. See §10 — the flat `/comments/{id}` form the plan drew
would have let anyone reach any comment in the system by id.

`PATCH` carries two fields with **two different authorities** — the body is the author's, the
resolved flag is anyone who may comment — so each is checked separately, and `model_fields_set`
distinguishes "not sent" from "sent as false". The same mechanism folders needed in Phase 13, for the
same reason: `false` and `null` are meaningful values, so their absence has to be detectable.

A comment on a document the caller cannot see is a **404** — its existence is as sensitive as the
document's. A comment they *can* see but may not change is a **403**: they already know it is there,
so refusing by name discloses nothing. See §10.

---

## 6. The interface

- Selecting text in the editor offers **Comment**. It is offered at `comment` level too, which is the
  first control in the app that a non-editor can use.
- A panel beside the document lists threads in document order, unresolved first, with resolved ones
  collapsed behind a count rather than hidden — a resolved thread is a record, not rubbish.
- Clicking a thread scrolls to and flashes its passage. Clicking a highlight opens its thread.
- A detached thread says so plainly, quoting the text it was about.
- The share dialog gains **Comment** as a grantable level, and `GrantablePermission` loses the
  comment in its type explaining why it could not be offered.
- The read-only banner stops calling a commenter's document read-only, and says what they can do
  instead.

| Situation | Behaviour |
|---|---|
| Viewer (`view`) | Reads comments. No compose box, no resolve, no reply |
| Commenter (`comment`) | Everything except changing the document |
| No comments yet | The panel says what it is for, rather than showing a blank |
| A reply to a reply | Not offered. Replies are one level |
| The commented text is deleted | The thread survives, marked detached |

---

## 7. Testing

| Layer | Coverage |
|---|---|
| Backend | Create, list, edit, delete, resolve, reply; a reply cannot have a reply |
| Backend | Each permission level, including that `view` cannot write and `comment` cannot edit the document |
| Backend | The owner may delete another person's comment but **not** edit it |
| Backend | Deleting a thread deletes its replies; deleting an account keeps its comments, authorless |
| Frontend | The panel renders threads, replies, resolved state and the detached case |
| Frontend | Controls absent at `view`; present at `comment` |
| End to end | A commenter comments on a document they cannot edit; the owner replies and resolves |

---

## 8. Out of scope

- Notifications and mentions. Both need an addressing model this app does not have.
- Rich text inside a comment. Plain text — a comment on a formatted document does not need to be one.
- Suggestions / tracked changes. That is an editing feature wearing a comment's clothes.
- Reattaching a detached comment by hand.

---

## 9. Definition of done

- [x] A `comment`-level collaborator can comment and still cannot change the document
- [x] A comment survives edits elsewhere in the document, and says so when its own passage is gone
- [x] Nothing about commenting writes document content
- [x] The owner can delete any comment and edit none
- [x] Comment is grantable in the share dialog
- [x] Backend, Vitest and Playwright pass

## 10. What the build changed from the plan

**Routes are nested under their document** — `/documents/{id}/comments/{comment_id}` rather than
`/comments/{comment_id}`. That follows attachments and versions, and it closes a hole the flat form
left open: without the document in the path, anyone could reach any comment in the system by id.
The service checks the document first, then requires the comment to belong to it.

**Two failure codes, and the split is deliberate.** A comment on a document the caller cannot see is
a 404 — its existence is as sensitive as the document's. A comment they *can* see but may not change
is a 403, because by then they already know it exists and refusing by name reveals nothing. This is
the case `PermissionDeniedError`'s docstring anticipated and no code had needed until now.
