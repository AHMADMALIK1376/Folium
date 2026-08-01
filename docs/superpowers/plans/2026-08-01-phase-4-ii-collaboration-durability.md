# Folium Phase 4-ii — Collaboration durability

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct cursor identity, an honest connection indicator, and the room's content reaching Postgres.

**Spec:** `docs/superpowers/specs/2026-08-01-phase-4-ii-collaboration-durability-design.md`

## Global Constraints

- **Nothing changes when collaboration is off.** With `Y_SWEET_CONNECTION_STRING` unset the editor must behave exactly as it does today, and the e2e suite must still pass with it unset.
- **Do not re-seed the editor from props.** The room owns content once collaboration is on; the only writes into a mounted editor are 4-i's seeding rule and a restore.
- **Do not rebuild the editor.** It mounts once, after collaboration resolves. Anything that changes its configuration mid-session throws away what someone is typing — that was 4-i's whole bug.
- 404 for no-access, 503 for vendor-down, `enabled: false` for unconfigured.
- Baselines: backend **187**, Vitest **162**, Playwright **24** with collaboration on / **22 + 2 skipped** without. ruff, tsc, build clean.

---

### Task 1: The session says who is asking

**Files:**
- Modify: `backend/app/schemas/collab.py`, `backend/app/api/v1/collab.py`, `backend/tests/test_collab_api.py`
- Modify: `frontend/src/lib/api/types.ts`, `frontend/src/lib/collab/useCollaboration.ts` and its test
- Modify: `frontend/src/components/editor/DocumentEditor.tsx` and its test

- [ ] **Step 1: Failing backend test**

The response carries `user.id` and `user.display_name`, and they are **the caller's** — assert with a collaborator on someone else's document, so an implementation that returns the owner fails.

- [ ] **Step 2: Backend**

`CollabSession` gains a `user: CollabUser` (id, display_name). The route already has `user` from `CurrentUser`; nothing new is fetched.

Include it whether or not collaboration is enabled — the shape stays constant, and a client that reads it does not need to branch.

- [ ] **Step 3: Frontend**

`useCollaboration` exposes `user`. `DocumentEditor` labels the cursor with `user.display_name` and colours it with `cursorColor(user.id)`, replacing the two uses of `document.owner`.

Tests: with a session whose user differs from the document owner, the cursor config carries the session user. This is the test that would have caught the original bug.

- [ ] **Step 4: Verify and commit**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
```

```bash
cd D:/AJAIA/Folium/frontend && npm test && npx tsc --noEmit
```

---

### Task 2: Saying when the connection drops

**Files:**
- Create: `frontend/src/components/editor/ConnectionStatus.tsx` and its test
- Modify: `frontend/src/lib/collab/useCollaboration.ts` and its test
- Modify: `frontend/src/components/editor/DocumentEditor.tsx`

- [ ] **Step 1: Failing tests**

The hook exposes a `status` that starts as connecting and follows the provider's `connection-status` events. The component renders **Live**, **Connecting…**, or **Offline — reconnecting**, in a live region, and renders nothing at all when collaboration is off.

- [ ] **Step 2: Implement**

Subscribe with the provider's `on`/`off`, and unsubscribe on teardown. Map the provider's statuses onto the three the user sees — the intermediate handshaking state is still "connecting" to a person.

Place it beside `SaveStatus`. The two mean different things and both matter: one is "your work is in the database", the other is "you are sharing edits with anyone".

- [ ] **Step 3: Verify and commit**

---

### Task 3: The room's content reaches Postgres

**Files:**
- Create: `frontend/src/lib/collab/reconcile.ts` and its test
- Modify: `frontend/src/components/editor/DocumentEditor.tsx` and its test

- [ ] **Step 1: A pure decision, tested directly**

```ts
type SyncAction = "seed" | "save" | "none";
export function decideOnSync(roomIsEmpty: boolean, roomContent: TipTapDoc, stored: TipTapDoc): SyncAction;
```

Cover: an empty room with stored content seeds; a room that differs saves; a room that matches does nothing; an empty room and empty storage does nothing; comparison ignores key order, so an equivalent document does not cause a pointless write on every open.

Keeping the decision pure is the point — the alternative is asserting it through a mocked editor, which proves less and breaks more often.

- [ ] **Step 2: Wire it into the sync handler**

Replace 4-i's seed-only handler. On `synced`, ask `decideOnSync`, then seed, or `schedule({ content })` so it flows through the existing autosave — which means Phase 3 snapshots it like any other edit.

Only a user who can edit reconciles: a viewer's PATCH would 404, and their client has no business writing.

- [ ] **Step 3: Verify and commit**

---

### Task 4: End to end

**Files:**
- Modify: `frontend/e2e/collaboration.spec.ts`

- [ ] **Step 1: Two names, not one**

In the existing two-browser test, after both are editing, assert each page shows the *other* participant's name on a caret — and that the owner's name does not appear twice. This is the assertion that would have caught the mislabelling.

Cursor labels render inside the editor as ProseMirror widgets; locate them by their text rather than by class.

- [ ] **Step 2: The indicator is present and honest**

Assert the collaborating editor shows **Live** once connected, and that a document opened without collaboration shows no indicator at all.

- [ ] **Step 3: Run everything twice, in both configurations**

```bash
cd D:/AJAIA/Folium/frontend && npm run collab
```

```bash
Y_SWEET_CONNECTION_STRING=ys://127.0.0.1:8080 npm run e2e
```

Then again with it unset, where the collaboration spec skips itself.

---

### Task 5: Documentation

- [ ] README: cursor identity, the connection indicator, and how the record repairs itself when a room is ahead.
- [ ] ARCHITECTURE: why reconciliation happens in the browser — the `pycrdt` pin — so the next person does not rediscover it.
- [ ] Ledger: archive 4-i's, open 4-ii's.

---

## Definition of done

Mirrors the spec's, which is the authority.
