# Folium Phase 2C-ii — The editor on FastAPI

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a document at `/documents/{id}`, edit and rename it, and autosave as TipTap JSON.

**Architecture:** The page is a Server Component fetching through the existing `serverApiFetch`; the editor is a Client Component that PATCHes through the browser `apiFetch` on an 800ms debounce and flushes with `keepalive` on unload. The backend is unchanged — `GET`/`PATCH /api/v1/documents/{id}` already return content plus permission and already validate TipTap JSON.

**Spec:** `docs/superpowers/specs/2026-07-30-phase-2c-ii-editor-design.md`

**Tech Stack:** Next.js 15.5, React 18.3, TypeScript, Tailwind v4, shadcn/ui, TipTap 2.27, Vitest, Playwright.

## Global Constraints

- **React 18.3, not React 19.** shadcn components must use `React.forwardRef`.
- **`immediatelyRender: false`** on every `useEditor` call, or SSR hydration fails.
- **`keepalive: true`, never `navigator.sendBeacon`.** sendBeacon cannot set an `Authorization` header, and every v2 request needs one.
- **Never `router.refresh()` on save.** The client owns the text being typed; re-running the server render mid-keystroke fights the editor for its own content.
- Content is TipTap **JSON** (`editor.getJSON()`). `getHTML()` is rejected by the backend's schema validator.
- A mutation error is rendered with `ApiErrorMessage` and a `fallback` — never a bare `catch` that collapses 401/503 into one message.
- Destructive actions use `carmine-700`; brand carmine is `carmine-500`.
- **Do not delete any v1 file** except `frontend/src/app/documents/[id]/page.tsx`, which collides with the new route. 2C-iii removes the rest.
- Baselines that may not regress: backend **158**, Vitest **59**, v1 `node --test` **14**, Playwright **7**. ruff, `tsc --noEmit`, and `next build` all clean.
- Nothing may download to `C:`.

---

### Task 1: Close the stale-cache finding from 2C-i

**Files:**
- Create: `frontend/src/components/auth/StaleSessionGuard.tsx`
- Create: `frontend/src/components/auth/StaleSessionGuard.test.tsx`
- Modify: `frontend/src/app/(app)/layout.tsx`
- Modify: `frontend/src/app/(app)/account/page.tsx` (drop its private copy)

**Interfaces:**
- Produces: `StaleSessionGuard` (no props), rendered once in the `(app)` layout

- [ ] **Step 1: Write the failing tests**

Cover exactly three things: a bfcache restore (`persisted: true`) reloads; an ordinary `pageshow` (`persisted: false`) does not; the listener is removed on unmount. Stub `window.location.reload` with a spy — jsdom's is not writable, so define it with `Object.defineProperty` and restore it afterwards.

- [ ] **Step 2: Create the component**

```tsx
"use client";

import { useEffect } from "react";

/** Reload a page restored from the back/forward cache.
 *
 * bfcache restores the entire JS heap on Back — no network request, no effects
 * re-run — so after signing out, Back would paint the previous session's
 * documents straight from memory. The client Router Cache can do the same for
 * an RSC payload within one tab. `cache: "no-store"` in the server API client
 * does not help: that opts out of Next's Data Cache, which is a different
 * cache.
 *
 * `persisted` is true only for a bfcache restore, so an ordinary navigation
 * pays nothing. Rendered once in the (app) layout rather than per page, so
 * every route behind the auth guard is covered by one implementation.
 */
export function StaleSessionGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
```

- [ ] **Step 3: Render it in the layout and remove the duplicate**

Add `<StaleSessionGuard />` to `frontend/src/app/(app)/layout.tsx`, and delete the `pageshow` effect from `account/page.tsx` — one implementation, not two.

- [ ] **Step 4: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "fix(frontend): reload bfcache restores for every page behind the guard"
```

---

### Task 2: Document types and fetchers

**Files:**
- Modify: `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/lib/api/server.ts`
- Create: `frontend/src/lib/api/documents.ts`
- Create: `frontend/src/lib/api/documents.test.ts`

**Interfaces:**
- Produces: `DocumentDetail`, `TipTapDoc`, `Permission` in `types.ts`; `getDocument(id)` in `server.ts`; `updateDocument(id, patch, init?)` in `documents.ts`

- [ ] **Step 1: Add the types**

```ts
/** A TipTap document node tree. Deliberately loose: the backend validates the
 *  structure, and mirroring its validator here would duplicate the rule
 *  without enforcing it. */
export interface TipTapDoc {
  type: "doc";
  content?: unknown[];
}

export type Permission = "owner" | "edit" | "comment" | "view";

export interface DocumentDetail extends DocumentSummary {
  content: TipTapDoc;
  permission: Permission;
  owner: UserProfile;
}
```

- [ ] **Step 2: Add `getDocument` to the server client**

```ts
export function getDocument(id: string): Promise<DocumentDetail> {
  return serverApiFetch<DocumentDetail>(`/api/v1/documents/${id}`);
}
```

- [ ] **Step 3: Write the failing tests for `updateDocument`**

Assert: it PATCHes `/api/v1/documents/{id}`; the body carries only the fields given; `init` passes through, so `{ keepalive: true }` reaches `fetch`; an `ApiError` propagates rather than being swallowed.

- [ ] **Step 4: Create `frontend/src/lib/api/documents.ts`**

```ts
import { apiFetch } from "./client";
import type { DocumentDetail, TipTapDoc } from "./types";

export interface DocumentPatch {
  title?: string;
  content?: TipTapDoc;
}

/** Save a document. `init` exists for the unload flush, which needs
 *  `keepalive: true` so the request outlives the page. */
export function updateDocument(
  id: string,
  patch: DocumentPatch,
  init: RequestInit = {},
): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/api/v1/documents/${id}`, {
    ...init,
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
```

- [ ] **Step 5: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): add document detail types and a save fetcher"
```

---

### Task 3: The autosave hook

The riskiest logic in the phase, and the only part testable without a real browser. It is built and tested on its own, before anything renders it.

**Files:**
- Create: `frontend/src/lib/hooks/useAutosave.ts`
- Create: `frontend/src/lib/hooks/useAutosave.test.ts`

**Interfaces:**
- Produces: `useAutosave({ save })` → `{ status, error, schedule, flush }`; `SaveStatus = "saved" | "saving" | "unsaved" | "failed"`

- [ ] **Step 1: Write the failing tests**

Use `vi.useFakeTimers()`. Cover:

1. A burst of `schedule()` calls produces **one** save after the debounce, carrying the **last** patch.
2. Status goes `unsaved` → `saving` → `saved`.
3. A rejected save leaves status `failed` and exposes the error; it does **not** read as saved.
4. A later successful save clears the failure.
5. `flush()` with a pending edit saves immediately, passing `keepalive: true`.
6. `flush()` with nothing pending sends no request.
7. Unmounting cancels a pending timer — no save fires after teardown.
8. Each save carries the newest patch, not a stale closure of the first one.

- [ ] **Step 2: Implement it**

Key requirements, each of which a test above pins:

- Keep the pending patch in a `useRef`, merged across calls, so a title change and a content change in the same window become one PATCH and no keystroke is captured in a stale closure.
- Clear the timer on unmount.
- `flush` reads the same ref, so it cannot flush an out-of-date patch.
- The save function is passed in, not imported, so the tests need no network and no Supabase.

- [ ] **Step 3: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): add a debounced autosave hook with an unload flush"
```

---

### Task 4: The editor component

**Files:**
- Create: `frontend/src/components/editor/DocumentEditor.tsx`
- Create: `frontend/src/components/editor/DocumentEditor.test.tsx`
- Create: `frontend/src/components/editor/EditorToolbar.tsx`
- Create: `frontend/src/components/editor/SaveStatus.tsx`
- Modify: `frontend/src/app/globals.css` (editor prose styles)

**Interfaces:**
- Consumes: `useAutosave`, `updateDocument`, `DocumentDetail`
- Produces: `DocumentEditor` with props `{ document: DocumentDetail }`

- [ ] **Step 1: Write the failing tests**

Mock `@tiptap/react` — ProseMirror needs DOM APIs jsdom lacks, and a test against a mocked ProseMirror proves nothing about editing anyway; Playwright covers the real thing. The mock returns a fake editor exposing `getJSON`, `isActive`, `setEditable`, and `chain()`.

Cover:

1. `permission: "view"` renders no toolbar and no editable title.
2. `permission: "comment"` behaves identically to `view` this phase.
3. `permission: "owner"` and `"edit"` render the toolbar and an editable title input.
4. Typing in the title schedules a save carrying the new title.
5. A blank title never reaches the API and reverts on blur.
6. A failed save renders the `ApiErrorMessage` fallback wording, and the status does not read "Saved".
7. The save status is in an `aria-live` region so a screen reader hears it change.

- [ ] **Step 2: Build `SaveStatus.tsx`**

Four states with plain wording: `Saved`, `Saving…`, `Unsaved changes`, and a failure that says the save failed and the next edit will retry. `aria-live="polite"`, `role="status"`.

- [ ] **Step 3: Build `EditorToolbar.tsx`**

Bold, italic, underline, H1, H2, paragraph, bulleted list, numbered list — the marks v1 supported and the import converter produces. Buttons use `onMouseDown={(e) => e.preventDefault()}` so clicking one does not steal the selection, and carry `aria-pressed` from `editor.isActive(...)`.

- [ ] **Step 4: Build `DocumentEditor.tsx`**

```tsx
const editor = useEditor({
  extensions: [StarterKit, Underline],
  content: document.content,
  editable: canEdit,
  // TipTap renders synchronously by default, which produces server markup the
  // client cannot match. Required for any editor inside a Server Component tree.
  immediatelyRender: false,
  onUpdate: ({ editor }) => schedule({ content: editor.getJSON() as TipTapDoc }),
});
```

Wire the flush:

```tsx
useEffect(() => {
  // visibilitychange is the reliable one — beforeunload does not fire on mobile
  // Safari when a tab is discarded. Both are cheap, so listen for both.
  const onHide = () => flush();
  const onVisibility = () => {
    if (window.document.visibilityState === "hidden") flush();
  };
  window.addEventListener("beforeunload", onHide);
  window.document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("beforeunload", onHide);
    window.document.removeEventListener("visibilitychange", onVisibility);
  };
}, [flush]);
```

Note `window.document` throughout: the `document` prop shadows the global.

- [ ] **Step 5: Add the prose styles**

Editor content is raw ProseMirror output with no typography plugin in the project. Add a `.folium-prose` block to `globals.css` styling `h1`, `h2`, `p`, `ul`, `ol`, `li`, and `strong` on the neutral ramp, plus `.ProseMirror:focus { outline: none }` — the focus ring belongs on the editor's container, not its content.

- [ ] **Step 6: Verify and commit**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit && npm run build
```

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "feat(frontend): add the TipTap editor with autosave and read-only mode"
```

---

### Task 5: The route

**Files:**
- Create: `frontend/src/app/(app)/documents/[id]/page.tsx`
- Create: `frontend/src/components/documents/DocumentNotFound.tsx`
- Modify: `frontend/src/middleware.ts`
- Delete: `frontend/src/app/documents/[id]/page.tsx`

- [ ] **Step 1: Move `/documents` from retired to protected**

In `frontend/src/middleware.ts`, remove `"/documents"` from `RETIRED` and add it to `PROTECTED`. `RETIRED` **must keep `/api/`** — those v1 routes still mint passwordless sessions.

- [ ] **Step 2: Delete the colliding v1 page**

```bash
cd D:/AJAIA/Folium && rm "frontend/src/app/documents/[id]/page.tsx"
```

Its components stay until 2C-iii; only the route file goes.

- [ ] **Step 3: Create `DocumentNotFound.tsx`**

One message for "does not exist" and "not allowed", because the backend deliberately returns 404 for both. Distinguishing them in the UI would re-open the enumeration hole the backend closed. Include a link back to the dashboard.

- [ ] **Step 4: Create the page**

```tsx
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;   // Next 15: params is a promise

  let document: DocumentDetail;
  try {
    document = await getDocument(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return <DocumentNotFound />;
    return <ApiErrorMessage error={error} />;
  }

  return <DocumentEditor document={document} />;
}
```

Add `generateMetadata` so the browser tab carries the document title.

- [ ] **Step 5: Prove the route resolves**

```bash
cd D:/AJAIA/Folium/frontend && npx tsc --noEmit && npm run build
```

Expected: `/documents/[id]` in the route table. Then, with the dev server running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/documents/00000000-0000-0000-0000-000000000000
```

Expected: **307** to `/login` when signed out — **not 404**. A 404 means `/documents` is still in `RETIRED`.

- [ ] **Step 6: Commit**

```bash
cd D:/AJAIA/Folium && git add -A frontend/ && git commit -m "feat(frontend): serve the editor at /documents/[id] from FastAPI"
```

---

### Task 6: End-to-end coverage

**Files:**
- Modify: `frontend/e2e/documents.spec.ts`

- [ ] **Step 1: Extend the spec**

Add one test doing the full round trip, which is the only proof the JSON survives the trip through `jsonb`:

1. Sign up, create a document, open it from the dashboard.
2. Type a unique string into the editor.
3. Wait for the status to read `Saved`.
4. **Reload the page** and assert the text is still there — server-rendered, from the database.
5. Rename the document in the editor, wait for `Saved`.
6. Go back to the dashboard and assert the new title is listed.

Also assert `/documents/{id}` redirects to `/login` when signed out, and that a signed-in user opening a random UUID sees the not-found message rather than a crash.

- [ ] **Step 2: Run it twice**

Start the backend first:

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000
```

```bash
cd D:/AJAIA/Folium/frontend && npm run e2e
```

Both runs must pass. A second-run failure means data is being reused across runs.

- [ ] **Step 3: Full regression**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npm test
```

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
```

Expected: backend 158, v1 14, ruff clean, and no Vitest or Playwright regression.

- [ ] **Step 4: Commit**

```bash
cd D:/AJAIA/Folium && git add frontend/ && git commit -m "test(frontend): cover opening, editing, saving, and renaming end to end"
```

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: Update the README**

Mark 2C-ii done in the phase table, drop "the editor dead-ends" from the status block, and move editing out of the *not yet rebuilt* list. `Content storage: TipTap JSON` earns its ✅ in the v1-versus-v2 table.

- [ ] **Step 2: Start a 2C-ii ledger**

Archive the 2C-i ledger to `.superpowers/sdd/phase-2c-i-progress.md` and open a fresh `progress.md`, recording that the deferred stale-cache finding is now closed.

- [ ] **Step 3: Commit**

```bash
cd D:/AJAIA/Folium && git add -A && git commit -m "docs: record Phase 2C-ii"
```

---

## Definition of done

- [ ] `/documents/{id}` opens a document server-rendered, title and content already in the HTML
- [ ] Typing autosaves as TipTap JSON; a reload shows the saved text
- [ ] A burst of typing produces one save, not one per keystroke
- [ ] Leaving the page with an edit pending still saves it, via `keepalive`
- [ ] A failed save says so and never reads as "Saved"
- [ ] Renaming from the editor shows the new title on the dashboard
- [ ] A blank title is never sent to the API
- [ ] A read-only document offers no toolbar and no editable title
- [ ] A missing document and a forbidden one produce the identical message
- [ ] 401 and 503 stay visibly distinguishable
- [ ] Back after signing out never shows the previous session's documents or contents
- [ ] No dashboard link dead-ends any more
- [ ] Backend 158, v1 14, ruff clean, Vitest and Playwright green — Playwright twice in a row
- [ ] No v1 file deleted except `src/app/documents/[id]/page.tsx`
