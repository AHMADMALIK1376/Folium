# Folium Phase 2C-iii — Sharing, import, and retiring v1

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share with permission levels, import `.txt`/`.md`, and delete the v1 application.

**Architecture:** Frontend-only again — every endpoint already exists. Sharing is a dialog in the editor header (owner only) calling the browser `apiFetch`; import posts multipart to `/api/v1/documents/import`, which requires `apiFetch` to stop hardcoding a JSON content type. Deletion comes last, once the replacements are proven.

**Spec:** `docs/superpowers/specs/2026-07-30-phase-2c-iii-sharing-import-design.md`

## Global Constraints

- **React 18.3, not React 19.** shadcn components need `React.forwardRef`.
- A mutation error renders through `ApiErrorMessage` with a `fallback`; never a bare `catch` collapsing 401/503/422.
- Any client component that mutates then calls `router.refresh()` must stay disabled through the transition (`useTransition`), as `CreateDocumentButton` does. A raw `finally { setBusy(false) }` is the bug.
- Destructive actions use `carmine-700`.
- **Do not weaken an existing test.** Several pin security properties: the open-redirect guard, non-enumeration, 401-vs-503.
- **Delete v1 only in Task 6**, after grep proves nothing imports it, and in one commit so it is trivially revertable.
- Baselines: backend **158**, Vitest **87**, Playwright **13**. The v1 `node --test` 14 disappear in Task 6 — by design, with the coverage accounted for in the spec.
- Nothing may download to `C:`.

---

### Task 1: `apiFetch` learns multipart

**Files:**
- Modify: `frontend/src/lib/api/client.ts`
- Modify: `frontend/src/lib/api/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the existing describe block:

1. A `FormData` body gets **no** `Content-Type` header — the browser must generate one including its boundary.
2. A JSON body still gets `Content-Type: application/json` (the existing path, unchanged).
3. An explicit `Content-Type` in `init.headers` still wins for a non-FormData body.

- [ ] **Step 2: Implement**

Build the headers conditionally rather than spreading a constant:

```ts
const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
const headers: Record<string, string> = {
  // Omitted for FormData: the browser generates multipart/form-data with a
  // boundary parameter, and a hardcoded JSON type makes the server reject the
  // body it is actually sent.
  ...(isFormData ? {} : { "Content-Type": "application/json" }),
  ...(init.headers as Record<string, string>),
  Authorization: `Bearer ${session.access_token}`,
};
```

Do not touch anything else in the file: every authenticated request in the app goes through it.

- [ ] **Step 3: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): let apiFetch send multipart bodies"
```

---

### Task 2: Share fetchers and types

**Files:**
- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/lib/api/documents.ts`
- Modify: `frontend/src/lib/api/documents.test.ts`

**Interfaces:**
- Produces: `Share`, `GrantablePermission` in types; `listShares`, `createShare`, `updateShare`, `deleteShare`, `importDocument` in `documents.ts`

- [ ] **Step 1: Add the types**

```ts
/** What an owner may grant today. The backend also accepts "comment", but
 *  commenting is not built, so granting it would promise a capability that does
 *  not exist. An existing comment share is still displayed — see Permission. */
export type GrantablePermission = "view" | "edit";

export interface Share {
  user_id: string;
  email: string;
  display_name: string;
  permission: string;
  created_at: string;
}
```

- [ ] **Step 2: Write the failing tests**

Assert each fetcher's method and path, that `createShare` sends `{email, permission}`, that `deleteShare` tolerates a 204 (no body), and that `importDocument` posts a `FormData` containing the file under the field name `file` — the name the backend's `File()` parameter requires.

- [ ] **Step 3: Implement the fetchers**

`listShares(id)`, `createShare(id, email, permission)`, `updateShare(id, userId, permission)`, `deleteShare(id, userId)`, and:

```ts
export function importDocument(file: File): Promise<DocumentDetail> {
  const body = new FormData();
  // "file" is not arbitrary: it is the name of the backend's File() parameter.
  body.append("file", file);
  return apiFetch<DocumentDetail>("/api/v1/documents/import", { method: "POST", body });
}
```

- [ ] **Step 4: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): add share and import fetchers"
```

---

### Task 3: The share dialog

**Files:**
- Create: `frontend/src/components/documents/ShareDialog.tsx`
- Create: `frontend/src/components/documents/ShareDialog.test.tsx`
- Modify: `frontend/src/components/editor/DocumentEditor.tsx`

**Interfaces:**
- Consumes: the share fetchers, `Dialog` from `@/components/ui/dialog`
- Produces: `ShareDialog` with props `{ documentId: string }`, rendered by `DocumentEditor` for owners only

- [ ] **Step 1: Write the failing tests**

1. Opening the dialog lists the current collaborators, with their permission.
2. A `comment` share is displayed as "Can comment", and the dropdown for it does not offer comment as a choice — only view and edit.
3. Adding a collaborator posts the email and the chosen permission, then re-lists.
4. A 422 shows the backend's `detail` verbatim ("No user with that email"), not a generic message.
5. A 401 shows the sign-in message instead — the shared `ApiErrorMessage` path.
6. Removing a collaborator calls delete and drops them from the list.
7. A 404 from a mutation says the document is no longer available.
8. The email field rejects an empty value without calling the API.
9. Controls stay disabled while a request is in flight, so a double-click cannot double-post.

- [ ] **Step 2: Implement**

Owner-only is enforced by the caller, not inside the dialog. State: the share list, a busy flag, and an error. After any mutation, re-fetch the list rather than patching it locally — the list is small, the source of truth is the server, and an owner who has two tabs open should not see them diverge.

- [ ] **Step 3: Wire it into the editor header**

Render `<ShareDialog documentId={document.id} />` only when `document.permission === "owner"`. Not for `edit`: the backend rejects share mutations from non-owners, so an editor would only ever get a 404.

- [ ] **Step 4: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit && npm run build
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): share documents with view or edit permission"
```

---

### Task 4: Import from the dashboard

**Files:**
- Create: `frontend/src/components/documents/ImportDocumentButton.tsx`
- Create: `frontend/src/components/documents/ImportDocumentButton.test.tsx`
- Modify: `frontend/src/app/(app)/dashboard/page.tsx`
- Modify: `frontend/src/components/documents/DocumentList.tsx` (empty shared state)

- [ ] **Step 1: Write the failing tests**

1. Choosing a `.md` file uploads it and navigates to the new document.
2. A `.pdf` is refused **before** any network call, naming the accepted types.
3. A file over 2MB is refused before any network call.
4. An upload failure surfaces through `ApiErrorMessage` and re-enables the control.
5. The control is disabled while uploading.
6. Extension matching is case-insensitive — `.MD` is accepted.

Client-side checks exist for a fast, clear rejection; the backend enforces the same limits regardless.

- [ ] **Step 2: Implement**

A visually styled `<label>` wrapping a hidden `<input type="file" accept=".txt,.md,.markdown">`, so it looks like the neighbouring button while staying a real file input — keyboard-reachable and screen-reader-labelled. Reset `event.target.value` after handling, or choosing the same file twice in a row fires no change event.

On success, `router.push(\`/documents/${created.id}\`)` — an imported file is something the user wants to see.

- [ ] **Step 3: Close the 2C-i empty-shared-list finding**

Give the dashboard's shared list an `emptyMessage`: documents other people share appear there. Now that sharing is reachable, an unexplained blank is the wrong first impression.

- [ ] **Step 4: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit && npm run build
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): import a .txt or .md file as a new document"
```

---

### Task 5: End-to-end coverage

**Files:**
- Create: `frontend/e2e/sharing.spec.ts`
- Create: `frontend/e2e/import.spec.ts`

- [ ] **Step 1: The two-account sharing journey**

This is the case that could not be written before: nothing in the UI could create a `view` permission, so 2C-ii's read-only editor had only unit tests behind it.

Two contexts in one test, so both sessions exist at once:

```ts
const ownerContext = await browser.newContext();
const guestContext = await browser.newContext();
```

1. Sign up both accounts; the guest's dashboard shows the "shared with you" empty state.
2. The owner creates a document, opens it, and shares it with the guest's email as **view**.
3. The guest reloads the dashboard, sees it under "Shared with you", opens it — and finds no toolbar, no editable title, and a read-only notice.
4. The owner changes the level to **edit**.
5. The guest reloads and can now type, and the text saves.
6. The owner removes the share; the guest's dashboard no longer lists it, and opening the URL directly gives the not-found message.

- [ ] **Step 2: The import journey**

Write a small `.md` fixture to a temp path from the test (`# Heading`, `**bold**`, a `-` list), upload it with `setInputFiles`, and assert the editor shows an `h1` with the heading text and an `li` for the list item — proving the backend's converter produced real TipTap nodes, not a wall of text.

Then assert a `.pdf` is rejected client-side with no request in flight.

- [ ] **Step 3: Run everything twice**

Start the backend first:

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000
```

```bash
cd D:/AJAIA/Folium/frontend && npm run e2e
```

Both runs must pass.

- [ ] **Step 4: Commit**

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "test(frontend): cover sharing between two accounts and importing a file"
```

---

### Task 6: Delete v1

Last, and in one commit, so reverting is trivial.

**Files:**
- Delete: `frontend/src/app/api/**` (7 route handlers)
- Delete: `frontend/src/lib/{db,repo,auth,types,importFile,validation}.ts`
- Delete: `frontend/src/components/{DashboardActions,DocumentCard,DocumentEditorShell,Editor,LoginOptions,ShareModal,TopBar}.tsx`
- Delete: `frontend/test/` (3 files)
- Modify: `frontend/src/middleware.ts`, `frontend/package.json`, `.github/workflows/frontend.yml`

- [ ] **Step 1: Prove nothing imports any of it**

```bash
cd D:/AJAIA/Folium/frontend && grep -rn "lib/db\|lib/repo\|lib/types\|lib/importFile\|lib/validation\"\|lib/auth\"\|DocumentEditorShell\|ShareModal\|DashboardActions\|LoginOptions\|components/TopBar\|components/Editor\|components/DocumentCard" src/
```

Expected: **no output** other than matches inside the files being deleted. A hit anywhere else stops this task.

- [ ] **Step 2: Delete**

- [ ] **Step 3: Empty the middleware deny-list**

`RETIRED` and its check go entirely — there is nothing left to deny. Keep `PROTECTED` and the comment explaining why the response from `updateSession` must be returned.

- [ ] **Step 4: Fix `package.json`**

Remove the `test` script (`node --test test/*.test.ts` — the directory is gone). Drop the `node:sqlite` justification from `engines`, keeping `>=22.5.0` as Next's floor. Consider renaming `test:unit` to `test`, but only if every reference is updated in the same commit — CI, README, and the plans.

- [ ] **Step 5: Fix CI — it has been running the wrong suite**

`.github/workflows/frontend.yml` runs `npm test`, the v1 suite, and never runs Vitest. Change that step to run `npm run test:unit`. Without this, deleting v1 leaves CI running no frontend tests at all.

- [ ] **Step 6: Verify the app is intact without v1**

```bash
cd D:/AJAIA/Folium/frontend && npx tsc --noEmit && npm run test:unit && npm run build
```

Then, with the backend running, the full Playwright suite twice. A missing import surfaces in the build; a broken route surfaces only in the browser.

- [ ] **Step 7: Commit**

```bash
cd D:/AJAIA/Folium && git add -A && git commit -m "chore(frontend): delete the v1 application"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: README**

Phase 2C complete. Delete the "v1 is still in the tree" section, the "File upload (v1)" section's v1 framing, and the v1 rows from the comparison table's premise — the table becomes a record of what the rebuild changed rather than a description of two live systems. Document `npm run test:unit` as the frontend suite. Keep the note that `data/app.sqlite` can be deleted locally.

- [ ] **Step 2: ARCHITECTURE.md**

It documents both versions deliberately; keep the v1 history but mark it as history, not as a description of code in the repository.

- [ ] **Step 3: Ledger**

Archive the 2C-ii ledger, open a 2C-iii one, and record the sharing enumeration trade-off and the CI finding.

- [ ] **Step 4: Commit**

```bash
cd D:/AJAIA/Folium && git add -A && git commit -m "docs: record Phase 2C-iii and the completed v1 retirement"
```

---

## Definition of done

- [ ] An owner shares by email with view or edit, changes a level, and removes a collaborator
- [ ] A non-owner sees no Share control
- [ ] An existing `comment` share displays correctly and cannot be newly granted
- [ ] A mistyped email shows the backend's own message
- [ ] Removing an already-removed share reads as success
- [ ] The dashboard's "Shared with you" section explains itself when empty
- [ ] Importing a `.md` file creates a document with headings and lists intact, and opens it
- [ ] A wrong file type or an oversized file is refused before any upload
- [ ] `apiFetch` sends multipart correctly and JSON exactly as before
- [ ] No v1 file remains, and `middleware.ts` has no `RETIRED` list
- [ ] CI runs `npm run test:unit`
- [ ] Two accounts prove view-only then edit access in a real browser
- [ ] Backend 158, Vitest green, Playwright green twice; ruff, tsc, build clean
