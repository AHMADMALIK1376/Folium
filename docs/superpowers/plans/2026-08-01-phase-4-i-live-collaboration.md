# Folium Phase 4-i — Live collaboration

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two people editing one document at once, with cursors, over y-sweet — with Postgres still the record of truth.

**Spec:** `docs/superpowers/specs/2026-08-01-phase-4-i-live-collaboration-design.md`

**Architecture:** FastAPI mints y-sweet client tokens with `y-sweet-sdk` after the same permission check every document route uses. The editor binds TipTap to the Y.Doc from y-sweet's provider; the client that made a change still PATCHes merged JSON through the existing autosave.

## Global Constraints

- **Off unless configured.** With `Y_SWEET_CONNECTION_STRING` unset, everything behaves exactly as Phase 3. This is what keeps CI green and makes the feature reversible.
- **`y-sweet-sdk` uses `requests`, which is synchronous.** Every call from FastAPI goes through `asyncio.to_thread` (or `run_in_threadpool`) or it blocks the event loop for the whole process.
- **The room id derives from the document id, server-side.** A client that names its own room can join a room for a document it cannot read.
- **Disable StarterKit's history when Collaboration is on.** Two undo managers is the classic subtly-broken TipTap collaboration integration.
- **Only locally-originated Yjs updates schedule a save**, or every client PATCHes every keystroke everyone types.
- 404 for no-access, 503 for vendor-down, `enabled: false` for unconfigured — never 500.
- Baselines: backend **179**, Vitest **146**, Playwright **22**. ruff, tsc, build clean.

---

### Task 1: The token endpoint

**Files:**
- Modify: `backend/pyproject.toml` (add `y-sweet-sdk`), `backend/app/config.py`, `backend/.env.example`
- Create: `backend/app/services/collab.py`, `backend/app/api/v1/collab.py`, `backend/app/schemas/collab.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_collab_api.py`

- [ ] **Step 1: Failing tests**

Mock the SDK — the suite must not need a running y-sweet, exactly as it does not need Supabase.

1. Unconfigured → 200 with `enabled: false` and no token. Not an error.
2. Configured → 200 with `enabled: true`, a url, and a token.
3. **The room id passed to the SDK derives from the document id**, whatever the request contains.
4. A stranger → 404, and the SDK is never called. Assert both: minting first and checking after would leak a token for a document the caller cannot read.
5. A `view` collaborator → 200, with `permission: "view"` so the client knows to stay read-only.
6. The SDK raising → 503, not 500, and never 401.
7. Unauthenticated → 401.

- [ ] **Step 2: Config**

`y_sweet_connection_string: str = ""` in `Settings`, plus `collaboration_enabled` as a property. Document it in `.env.example` alongside how to run one locally:

```bash
npx y-sweet@latest serve --port 8080
```

- [ ] **Step 3: Service and route**

`app/services/collab.py` wraps the SDK, converts `YSweetError` into the project's own exception type, and does the blocking call in a thread. The route calls `get_document` first, then the service.

- [ ] **Step 4: Verify and commit**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
```

```bash
cd D:/AJAIA/Folium && git add backend/ && git commit -m "feat(backend): mint y-sweet room tokens after checking document access"
```

---

### Task 2: The provider, behind a flag

**Files:**
- Modify: `frontend/package.json` (`yjs`, `@y-sweet/client`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`)
- Modify: `frontend/src/lib/api/types.ts`, `frontend/src/lib/api/documents.ts` and its test
- Create: `frontend/src/lib/collab/useCollaboration.ts` and its test
- Create: `frontend/src/lib/collab/color.ts` and its test

- [ ] **Step 1: `getCollabToken(id)` fetcher, with tests**

- [ ] **Step 2: A deterministic colour per user id, with tests**

Same id always yields the same colour; two different ids usually differ; the palette avoids carmine, which is the app's own accent and would read as UI rather than as a person.

- [ ] **Step 3: `useCollaboration(documentId)`**

Returns `{ enabled, provider, doc, error }`. Fetches the token, and when `enabled` is false returns immediately with everything null — the editor then behaves exactly as it does today. Tears the provider down on unmount.

Tests: disabled stays disabled and constructs no provider; a failed token fetch degrades to disabled rather than throwing; unmount disconnects.

- [ ] **Step 4: Verify and commit**

---

### Task 3: Binding the editor

**Files:**
- Modify: `frontend/src/components/editor/DocumentEditor.tsx` and its test

- [ ] **Step 1: Failing tests** (with `@tiptap/react` mocked, as the existing tests do)

1. Collaboration off → the extension list has no Collaboration extension, `content` is still seeded from props, and history stays on.
2. Collaboration on → Collaboration and CollaborationCursor are present, `content` is **not** seeded, and StarterKit history is disabled.
3. A read-only user gets no cursor contribution.
4. A remote-origin update does not schedule a save; a local one does.

- [ ] **Step 2: Implement**

Build the extension list conditionally. When collaborative, pass `history: false` to StarterKit and add `Collaboration.configure({ document: doc })` plus `CollaborationCursor.configure({ provider, user: { name, color } })`.

The seeding rule, which is the risky part:

```ts
// Only after the provider says it has synced. Before that every client's Y.Doc
// looks empty, so seeding on mount inserts the document once per client and the
// text appears two or three times.
provider.on("sync", (synced) => {
  if (!synced || !canEdit) return;
  if (!editor.isEmpty) return;
  editor.commands.setContent(document.content);
});
```

- [ ] **Step 3: Verify and commit**

---

### Task 4: End to end, two browsers

**Files:**
- Create: `frontend/e2e/collaboration.spec.ts`
- Modify: `README.md` (how to run y-sweet locally)

- [ ] **Step 1: Run y-sweet locally**

```bash
npx y-sweet@latest serve --port 8080
```

Set `Y_SWEET_CONNECTION_STRING` for the backend and restart it.

- [ ] **Step 2: The test**

Two contexts, one document shared as edit, `test.slow()`.

1. Owner types; guest sees it **without reloading**.
2. Guest types; owner sees it, and sees a labelled cursor.
3. The document appears once, not duplicated — the seeding rule, asserted by counting occurrences.
4. Both close; a fresh load shows the merged text, proving it reached Postgres.

Skip the whole file when `Y_SWEET_CONNECTION_STRING` is absent, so the suite still passes for anyone
who has not started one.

- [ ] **Step 3: Run everything twice, then commit**

---

### Task 5: Documentation

- [ ] README: what collaboration does, that it is optional, how to run y-sweet locally, and the read-only caveat.
- [ ] ARCHITECTURE: y-sweet in the stack, why Python SDK support decided it, and that Postgres remains the record of truth.
- [ ] Ledger: archive Phase 3's, open 4-i's.

---

## Definition of done

Mirrors the spec's, which is the authority.
