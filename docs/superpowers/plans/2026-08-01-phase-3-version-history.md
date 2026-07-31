# Folium Phase 3 — Version history

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snapshot documents as they are edited, browse the history, and restore an earlier draft.

**Architecture:** Snapshots are written inside `update_document`, in the same transaction as the update, capturing the content being replaced. Three endpoints hang off the existing document routes. The frontend adds a history panel to the editor header, and restore drives TipTap's `setContent` so the editor updates without a reload.

**Spec:** `docs/superpowers/specs/2026-08-01-phase-3-version-history-design.md`

## Global Constraints

- **No migration.** `document_versions` exists from Phase 1. If this phase seems to need a schema change, stop — it does not.
- **Snapshot the content being replaced,** never the content being written. Restore means "go back".
- Services must not import fastapi. Domain errors (`NotFoundError`, `ValidationError`) are the contract; `app/main.py` maps them to status codes.
- **404, never 403,** for documents, shares, and versions alike. Access-denied and does-not-exist stay indistinguishable.
- A version id belonging to another document must 404 even for a caller who may see both documents.
- Frontend: React 18.3 (`React.forwardRef` in shadcn components), `ApiErrorMessage` with a `fallback` for every mutation, `useTransition` around any mutate-then-`router.refresh()`.
- Baselines: backend **158**, Vitest **127**, Playwright **20**. ruff, `tsc --noEmit`, and `next build` clean. Playwright must pass twice.
- Nothing may download to `C:`.

---

### Task 1: Snapshot on update

**Files:**
- Create: `backend/app/services/versions.py`
- Modify: `backend/app/services/documents.py`
- Test: `backend/tests/test_versions_service.py`

**Interfaces:**
- Produces: `SNAPSHOT_INTERVAL`, `MAX_VERSIONS_PER_DOCUMENT`, `maybe_snapshot(db, document, user_id)`, `snapshot(db, document, user_id)`, `prune(db, document_id)`

- [ ] **Step 1: Write the failing tests**

Against the service layer directly, using the existing async session fixture. Cover:

1. The first content update on a document writes exactly one version, holding the **old** content.
2. A second update moments later writes nothing — the 5-minute rule.
3. A second update by a **different user** writes a version even inside the window.
4. An update that changes only the title writes nothing.
5. Pruning keeps exactly the newest 50 and drops the oldest.
6. Pruning touches only the document being written — a second document's versions survive untouched.

Do not simulate the interval by patching a clock the code reads at import; write `created_at` explicitly on the fixture rows instead, so the test controls time through data rather than by reshaping the code under test.

- [ ] **Step 2: Write `backend/app/services/versions.py`**

```python
SNAPSHOT_INTERVAL = timedelta(minutes=5)
MAX_VERSIONS_PER_DOCUMENT = 50
```

`maybe_snapshot(db, document, user_id)` reads the newest version for the document and writes one when there is none, when it is older than `SNAPSHOT_INTERVAL`, or when its `created_by` differs from `user_id`. It records `document.content` — the value still in the object, before the caller assigns the new one.

`prune` deletes everything outside the newest `MAX_VERSIONS_PER_DOCUMENT` for that document, in one statement, scoped by `document_id`.

Neither commits. The caller owns the transaction, so the snapshot and the update land together or not at all.

- [ ] **Step 3: Call it from `update_document`**

In `backend/app/services/documents.py`, before assigning new content:

```python
    if data.content is not None:
        # Before the assignment: the row records what is being replaced, which is
        # what makes restore mean "go back" rather than "duplicate what is on
        # screen". Title-only updates deliberately snapshot nothing.
        await versions.maybe_snapshot(db, document, user_id)
        document.content = data.content
        document.content_text = doc_to_plain_text(data.content)
```

- [ ] **Step 4: Run and commit**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_versions_service.py -v
```

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
```

The full suite must still pass: `update_document` is on the path of every document test.

```bash
cd D:/AJAIA/Folium && git add backend/ && git commit -m "feat(backend): snapshot a version of the content each update replaces"
```

---

### Task 2: The versions API

**Files:**
- Create: `backend/app/api/v1/versions.py`
- Create: `backend/app/schemas/version.py`
- Modify: `backend/app/api/v1/router.py`, `backend/app/services/versions.py`
- Test: `backend/tests/test_versions_api.py`

**Interfaces:**
- Produces: `VersionSummary`, `VersionDetail`; `GET /documents/{id}/versions`, `GET .../versions/{version_id}`, `POST .../versions/{version_id}/restore`

- [ ] **Step 1: Write the failing tests**

1. Listing returns newest first and **no content field**.
2. Each entry carries the author's display name; a version whose `created_by` is null still serialises.
3. A user shared with **view** may list and read a version.
4. That same user gets **404** from restore.
5. A stranger gets 404 from all three.
6. A version id belonging to **another document** 404s — including when the caller owns both. This is the one that turns a list endpoint into a data leak if it is missed.
7. Restore sets the content and returns the document.
8. Restore snapshots the current content first, so the count grows by one and the newest version holds what was on screen before.
9. Restoring a version that does not exist 404s.
10. All three routes are 401 unauthenticated.

- [ ] **Step 2: Schemas**

`VersionSummary` — `id`, `created_at`, `created_by`, `author_name: str | None`. `VersionDetail` adds `content`. Keeping content off the summary is deliberate: a 50-entry list would otherwise return fifty full documents.

- [ ] **Step 3: Service functions**

`list_versions(db, document_id, user_id)` — calls `get_document` first, so view permission and the 404 rule are enforced by the code that already owns that decision. Joins users for the author name.

`get_version(db, document_id, version_id, user_id)` — must filter on **both** ids, not just the version id.

`restore_version(db, document_id, version_id, user_id)` — requires `can_edit`, snapshots current content unconditionally, assigns the version's content, refreshes `content_text`, prunes, commits.

- [ ] **Step 4: Router**

New module with prefix `/documents/{document_id}/versions`, registered in `router.py` alongside `shares`. No ordering hazard: the literal `/documents/trash` sits at a different depth from `/documents/{id}/versions`.

- [ ] **Step 5: Run and commit**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
```

```bash
cd D:/AJAIA/Folium && git add backend/ && git commit -m "feat(backend): list, read, and restore document versions"
```

---

### Task 3: Frontend fetchers

**Files:**
- Modify: `frontend/src/lib/api/types.ts`, `frontend/src/lib/api/documents.ts`, `frontend/src/lib/api/documents.test.ts`

- [ ] **Step 1: Types**

```ts
export interface VersionSummary {
  id: string;
  created_at: string;
  created_by: string | null;
  /** Null when the author's account was deleted — created_by is ON DELETE SET
   *  NULL, so history survives the account that made it. */
  author_name: string | null;
}

export interface VersionDetail extends VersionSummary {
  content: TipTapDoc;
}
```

- [ ] **Step 2: Failing tests, then `listVersions`, `getVersion`, `restoreVersion`**

Assert the paths and methods, and that `restoreVersion` is a POST returning the updated document.

- [ ] **Step 3: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm test && npx tsc --noEmit
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): add version history fetchers"
```

---

### Task 4: The history panel

**Files:**
- Create: `frontend/src/components/editor/HistoryDialog.tsx`, `frontend/src/components/editor/HistoryDialog.test.tsx`
- Create: `frontend/src/lib/format/relativeTime.ts` and its test
- Modify: `frontend/src/components/editor/DocumentEditor.tsx`

**Interfaces:**
- Produces: `HistoryDialog` with props `{ documentId: string; canEdit: boolean; onRestored: (content: TipTapDoc) => void }`

- [ ] **Step 1: A relative-time helper, with tests**

"about 2 hours ago" from an ISO string. Written rather than pulled in: it is a dozen lines, and a date library is a dependency for one line of UI. Cover seconds, minutes, hours, days, and — the one everyone forgets — a timestamp a second or two in the future from clock skew, which must read "just now" rather than "in 2 seconds".

- [ ] **Step 2: Failing tests for the panel**

1. Opening lists versions newest first with author and relative time.
2. A null `author_name` renders "Unknown".
3. Selecting a version fetches and shows a preview of its content as text.
4. Restore calls the API and hands the restored content to `onRestored`.
5. `canEdit: false` renders no Restore control at all.
6. An empty history explains itself.
7. A 404 on restore shows the error and re-fetches the list rather than leaving a stale row.
8. Controls disable while a request is in flight.

- [ ] **Step 3: Build it**

A `Dialog`, matching `ShareDialog` in structure and error handling. The preview renders the version's text content read-only — flatten the TipTap JSON to paragraphs for display; this is a preview, not a second editor.

- [ ] **Step 4: Wire into the editor**

Beside Share, for anyone who can view. On `onRestored`, call `editor.commands.setContent(content)`.

This is the one place the editor accepts content after mount, and it needs the comment saying why: 2C-ii deliberately seeds content once so a re-render cannot move the caret. A restore is a real content change the user asked for, applied by an explicit command rather than a prop.

- [ ] **Step 5: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm test && npx tsc --noEmit && npm run build
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): browse version history and restore an earlier draft"
```

---

### Task 5: End-to-end coverage

**Files:**
- Create: `frontend/e2e/history.spec.ts`

- [ ] **Step 1: Two authors, because that is how a version exists in seconds**

The 5-minute rule means one user typing cannot produce two versions inside a fast test. Rule 3 — a different author — can, and it is also the scenario history exists for. Use two contexts and the sharing UI, as `sharing.spec.ts` does. Mark it `test.slow()`.

1. The owner creates a document, types "First draft", and waits for Saved.
2. The owner shares it with the guest as **edit**.
3. The guest opens it, selects all, types "Replaced by the collaborator", waits for Saved. That save snapshots the owner's text.
4. The owner reloads, opens **History**, and finds an entry.
5. Previewing it shows "First draft".
6. Restoring it puts "First draft" back in the editor **without a reload**.
7. Reloading confirms it persisted.

- [ ] **Step 2: A viewer sees history but cannot restore**

Share as **view**, and assert the panel lists versions while offering no Restore control.

- [ ] **Step 3: Run twice, then the full regression**

```bash
cd D:/AJAIA/Folium/frontend && npm run e2e
```

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
```

- [ ] **Step 4: Commit**

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "test(frontend): cover restoring an earlier draft end to end"
```

---

### Task 6: Documentation

- [ ] **Step 1: README** — version history in the feature list and the phase table; drop "no version history" from the limitations and replace it with what is actually still missing.
- [ ] **Step 2: ARCHITECTURE.md** — the snapshot policy and retention rule belong with the data model, since they are the reason the table stays small.
- [ ] **Step 3: Ledger** — archive 2C-iii's, open Phase 3's.

```bash
cd D:/AJAIA/Folium && git add -A && git commit -m "docs: record Phase 3 version history"
```

---

## Definition of done

- [ ] Editing writes a version of the replaced content, at most one per 5 minutes
- [ ] A different author editing inside that window still produces one
- [ ] Title-only changes write nothing
- [ ] Each document keeps at most its newest 50 versions, pruned in the same transaction
- [ ] The list is newest-first, carries the author, and never carries content
- [ ] A version id from another document 404s, even for someone who may see both
- [ ] A viewer browses history; only an editor restores
- [ ] Restore snapshots the current content first, so it is itself undoable
- [ ] Restore updates the editor in place, with no reload
- [ ] Empty history and a deleted author both render sensibly
- [ ] Backend, Vitest, and Playwright green; Playwright twice; ruff, tsc, build clean
- [ ] No migration was written
