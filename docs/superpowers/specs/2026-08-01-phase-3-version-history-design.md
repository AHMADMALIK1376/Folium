# Folium Phase 3 — Version history

**Date:** 2026-08-01
**Status:** Approved, not yet implemented
**Scope:** Snapshot documents as they are edited, browse the history, and restore an earlier draft.

---

## 1. Context

Phase 2C finished the cut-over: authentication, dashboard, editor, sharing, and import all run on the
new stack, and the v1 application is gone. What remains from the roadmap's Phase 3 is version
history — hosted Postgres and soft delete were delivered along the way.

| Phase | Deliverable | Status |
|---|---|---|
| 2C | Dashboard, editor, sharing, import, and the end of v1 | Done |
| **3** | **This spec.** Version history with restore. | This phase |
| 4 | Real-time collaboration via a managed service | After |
| 5 | Attachments UI, export to PDF/Markdown | After |

### Why this matters now, specifically

Editing is last-write-wins and the editor does not poll. Two people in one document overwrite each
other, silently, and sharing shipped last phase — so the situation is now reachable by any pair of
real users rather than hypothetical. Live collaboration is the proper fix and needs a paid service;
version history is the affordable one, and it turns "your afternoon's work is gone" into "open
history and restore".

It is also the only remaining feature whose table already exists.

### What is already built

`document_versions` was created in Phase 1 and has never been written to:

```
document_versions
  id           uuid PK
  document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  content      jsonb NOT NULL
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL
  created_at   timestamptz NOT NULL DEFAULT now()
```

Indexed on `(document_id, created_at)`, which is what listing newest-first needs. `created_by` is
nullable and `SET NULL` on delete, so a deleted account leaves its versions intact and attributed to
nobody rather than taking them down with it.

No migration is needed. This phase writes to a table the schema already has.

---

## 2. When a version is written

Snapshotting every save is not an option worth costing out: autosave fires roughly every 800ms while
typing, so an afternoon's work would be hundreds of full-document JSONB copies, on a free tier
holding real users' documents.

A version is written on a content update **only when** one of these is true:

1. The document has no versions yet.
2. The newest version is **more than 5 minutes old**.
3. The newest version was written by **a different user** than the one saving now.

Rule 3 matters more than it looks. Two collaborators overwriting each other is exactly the case
version history exists to rescue, and time-bucketing alone would let one person's edit quietly
replace another's inside the same five-minute window with nothing kept.

### It snapshots the content being replaced, not the content being written

The row records the document **as it was before this update**. That is what makes restore mean
"go back": the newest version is the last state you can return to, not a duplicate of what is already
on screen.

One consequence to state plainly rather than discover later: the very first edit to a document
snapshots its empty starting state. That is correct — it is a real thing to go back to — but it means
a new document's history is never empty after its first edit.

### Title changes do not snapshot

Only content does. A title is one string, recoverable by retyping, and snapshotting the whole
document body because someone fixed a typo in the title would waste the budget the rules above exist
to protect.

---

## 3. Retention

Each write prunes that document's versions to the **newest 50**. Pruning is scoped to the one
document being written, so cost stays proportional to that document rather than to the table.

Fifty is far more history than anyone browses, and it bounds the database by document count instead
of by editing time — a document edited daily for a year holds the same 50 rows as one edited for a
week. Age-based retention would not: a heavily edited document can write thousands of rows inside
thirty days.

The pruning happens in the same transaction as the insert, so the invariant cannot drift.

---

## 4. The API

Three endpoints, under the existing document routes.

| | |
|---|---|
| `GET /api/v1/documents/{id}/versions` | Newest first. Returns id, `created_at`, and who made it — **not** the content, which would make the list enormous. Anyone who can view the document may list. |
| `GET /api/v1/documents/{id}/versions/{version_id}` | One version, with its content, for previewing before restoring. |
| `POST /api/v1/documents/{id}/versions/{version_id}/restore` | Sets the document's content to that version. Requires edit permission. Returns the updated document. |

### Who may do what

Listing and reading follow **view** permission: anyone who can open the document can already read its
current content, and its history is the same document over time.

Restoring requires **edit** permission, because it is an edit — it overwrites what everyone else
sees. It is not owner-only: an editor can already replace the entire body by selecting all and
typing, so restricting restore would protect nothing while removing the one safe way to undo.

A version id belonging to a different document must 404 even when the caller may see both. Otherwise
`/documents/A/versions/{id-from-B}` becomes a way to read B's content through A's permissions.

### Restoring is itself undoable

A restore snapshots the current content first, unconditionally — ignoring the 5-minute rule. Someone
restoring the wrong version must be able to get back, and a restore is deliberate, so it is worth a
row.

---

## 5. The interface

A **History** control in the editor header, beside Share, opening a panel that lists versions newest
first: a relative timestamp ("about 2 hours ago"), the author's name, and the current version marked
as such.

Selecting one shows a read-only preview of that content, so nobody restores blind. **Restore** then
replaces the document, closes the panel, and the editor shows the restored content — without a page
reload, because the editor holds the content and must be told to take the new one.

| Situation | Behaviour |
|---|---|
| A viewer or commenter opens history | The list and previews render; there is no Restore control. The backend 404s their restore regardless. |
| A document with no versions | "No earlier versions yet. They appear here as you edit." — not a blank panel. |
| Restore fails | The shared `ApiErrorMessage` treatment. 404 means the version or document is gone; say so and reload the list rather than leaving a stale entry on screen. |
| The author's account was deleted | `created_by` is null. Show "Unknown" rather than crashing on a missing name. |

### The editor has to accept new content mid-session

Everywhere else in this codebase the editor owns its content from mount onward, and 2C-ii was
explicit that re-seeding from props would move the caret. Restore is the one legitimate exception:
the content genuinely changed underneath, at the user's own request. It uses TipTap's `setContent`
command, once, on a successful restore — not a prop-driven re-seed, which would re-run on unrelated
re-renders.

---

## 6. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Backend unit | pytest | The 5-minute rule; a different author forces a snapshot inside the window; title-only updates snapshot nothing; pruning keeps exactly the newest 50 |
| Backend API | pytest | Listing is newest-first and excludes content; a viewer may list but not restore; a version id from another document 404s; restore snapshots the current state first |
| Frontend unit | Vitest | The history fetchers; the panel lists and previews; no Restore control without edit permission; a null author renders as Unknown |
| End to end | Playwright | Type, wait, type again, open history, restore the earlier draft, and see the earlier text return — then reload and confirm it persisted |

The end-to-end case has to defeat the 5-minute rule to produce two versions in a test that finishes in
seconds. It does that honestly, by editing as two different users through the sharing UI — rule 3 —
rather than by reaching into the database or making the interval configurable for tests. A test that
alters the behaviour it is testing proves nothing.

---

## 7. Out of scope

- Diffing two versions, visually or otherwise. Preview and restore first; a diff view is a phase of
  its own and needs a JSON-aware diff, not a text one.
- Naming or annotating versions, and pinning one so retention cannot prune it.
- Restoring a title, or history for titles at all.
- Per-user undo, which is the editor's own history stack, not this.
- Real-time collaboration — Phase 4, and the reason this phase is worth building first.
- Exporting a version.
- Any change to the `document_versions` schema. It exists; this phase fills it.

---

## 8. Definition of done

- [ ] Editing a document writes a version of the content it replaced, at most one per 5 minutes
- [ ] A different author editing inside that window still produces a version
- [ ] Changing only the title writes no version
- [ ] Each document keeps at most its newest 50 versions
- [ ] The list is newest-first, carries the author, and never carries content
- [ ] A version id from another document 404s, even for someone who may see both
- [ ] A viewer can browse history; only an editor can restore
- [ ] Restoring snapshots the current content first, so it can itself be undone
- [ ] Restoring updates the editor in place, without a reload
- [ ] A document with no versions explains itself rather than rendering blank
- [ ] A deleted author reads as Unknown, not a crash
- [ ] Backend, Vitest, and Playwright all pass; Playwright passes twice in a row
- [ ] No schema migration was needed
