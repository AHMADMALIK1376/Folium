# Folium Phase 2C-i — Dashboard on FastAPI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A server-rendered dashboard and trash view reading documents from FastAPI, with create, delete, and restore.

**Architecture:** Pages are Server Components fetching through a new server-side API client that reads the access token from cookies. Mutations are Client Components calling the existing browser `apiFetch`, then `router.refresh()` to re-run the server render. The backend gains one endpoint, `GET /api/v1/documents/trash`, declared above `/{document_id}` because `"trash"` would otherwise be parsed as a document id.

**Tech Stack:** Next.js 15.5, React 18.3, TypeScript, Tailwind v4, shadcn/ui, FastAPI, SQLAlchemy 2.0 async, pytest, Vitest, Playwright.

## Global Constraints

- **React 18.3, not React 19.** shadcn components must use `React.forwardRef`, or React Hook Form's `register()` ref silently fails to attach.
- Next.js 15: `cookies()` is async and must be awaited. `middleware.ts` lives at `frontend/src/middleware.ts` — a project-root file is silently ignored when the project has a `src/` directory.
- Brand colours are carmine `#D41F26` and white plus a neutral ramp. Destructive actions use **`carmine-700` (`#8C1419`)**, never the brand carmine.
- **401 and 503 must stay visibly distinguishable.** An outage must not read as every user's credentials failing.
- The server API client uses `getSession()` **only** to obtain a token to forward — never to make an access decision. Middleware already authenticated the caller with `getUser()`, and the backend verifies the token independently.
- **Only the owner may delete or restore.** Shared documents must offer no delete action.
- **Nothing may download to `C:`.** npm cache and Playwright browsers are redirected to `D:`.
- `npm test` still runs the v1 `node --test` suite; Vitest is `test:unit`; Playwright is `e2e`.
- **Do not delete any v1 file.** Phase 2C-iii removes them. The exception is `src/app/dashboard/page.tsx`, which must go so the new route group can serve `/dashboard`.
- Backend suite is at 147 passing tests; Vitest at 38; Playwright at 4. None may regress.

---

### Task 1: The trash endpoint

**Files:**
- Modify: `backend/app/services/documents.py`
- Modify: `backend/app/api/v1/documents.py`
- Test: `backend/tests/test_documents_api.py`

**Interfaces:**
- Consumes: `Document`, `DocumentSummary`, `CurrentUser`, `DbSession`
- Produces: `list_trash(db, user_id) -> list[Document]`; `GET /api/v1/documents/trash` returning `list[DocumentSummary]`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_documents_api.py`:

```python
async def test_trash_lists_only_deleted_documents(client: AsyncClient, alice):
    kept = await client.post("/api/v1/documents", json={"title": "Kept"}, headers=alice)
    binned = await client.post("/api/v1/documents", json={"title": "Binned"}, headers=alice)
    await client.delete(f"/api/v1/documents/{binned.json()['id']}", headers=alice)

    response = await client.get("/api/v1/documents/trash", headers=alice)
    assert response.status_code == 200
    titles = [d["title"] for d in response.json()]
    assert titles == ["Binned"]
    assert kept.json()["id"] not in [d["id"] for d in response.json()]


async def test_trash_route_is_not_parsed_as_a_document_id(client: AsyncClient, alice):
    """`/documents/trash` genuinely matches `/documents/{document_id}`.

    Declared in the wrong order, "trash" is parsed as a document id, fails UUID
    validation, and returns 422 — so this asserts the status is not that.
    """
    response = await client.get("/api/v1/documents/trash", headers=alice)
    assert response.status_code == 200


async def test_trash_is_empty_for_a_new_user(client: AsyncClient, alice):
    response = await client.get("/api/v1/documents/trash", headers=alice)
    assert response.status_code == 200
    assert response.json() == []


async def test_trash_never_shows_another_users_deleted_document(
    client: AsyncClient, alice, bob
):
    created = await client.post("/api/v1/documents", json={"title": "Mine"}, headers=alice)
    await client.delete(f"/api/v1/documents/{created.json()['id']}", headers=alice)

    assert (await client.get("/api/v1/documents/trash", headers=bob)).json() == []


async def test_trash_excludes_documents_merely_shared_with_you(
    client: AsyncClient, alice, bob
):
    """A collaborator cannot restore a document and has no claim to see that
    its owner deleted it."""
    # /me provisions Bob's row and tells us the address to share with.
    bob_email = (await client.get("/api/v1/me", headers=bob)).json()["email"]

    created = await client.post("/api/v1/documents", json={"title": "Shared"}, headers=alice)
    doc_id = created.json()["id"]
    await client.post(
        f"/api/v1/documents/{doc_id}/shares",
        json={"email": bob_email, "permission": "edit"},
        headers=alice,
    )
    await client.delete(f"/api/v1/documents/{doc_id}", headers=alice)

    assert (await client.get("/api/v1/documents/trash", headers=bob)).json() == []


async def test_restoring_removes_a_document_from_the_trash(client: AsyncClient, alice):
    created = await client.post("/api/v1/documents", json={"title": "Back"}, headers=alice)
    doc_id = created.json()["id"]
    await client.delete(f"/api/v1/documents/{doc_id}", headers=alice)
    assert len((await client.get("/api/v1/documents/trash", headers=alice)).json()) == 1

    await client.post(f"/api/v1/documents/{doc_id}/restore", headers=alice)
    assert (await client.get("/api/v1/documents/trash", headers=alice)).json() == []


async def test_trash_requires_authentication(client: AsyncClient):
    assert (await client.get("/api/v1/documents/trash")).status_code == 401
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_documents_api.py -v -k trash
```

Expected: FAIL. Most return **422**, because `"trash"` is currently parsed as a `document_id` and fails UUID validation — the exact collision this endpoint's placement must avoid.

- [ ] **Step 3: Add the service function**

In `backend/app/services/documents.py`, add after `list_documents`:

```python
async def list_trash(db: AsyncSession, user_id: UUID) -> list[Document]:
    """Soft-deleted documents the user owns, most recently deleted first.

    Owner-only by construction: a collaborator cannot restore a document, and
    showing it in their trash would imply a claim they do not have.
    """
    result = await db.execute(
        select(Document)
        .where(Document.owner_id == user_id, Document.is_deleted.is_(True))
        .order_by(Document.deleted_at.desc())
    )
    return list(result.scalars())
```

- [ ] **Step 4: Add the route ABOVE the dynamic one**

In `backend/app/api/v1/documents.py`, insert this **immediately after** the `create_document` route and **before** `@router.get("/{document_id}")`:

```python
@router.get("/trash", response_model=list[DocumentSummary])
async def list_trash(db: DbSession, user: CurrentUser) -> list[DocumentSummary]:
    """Must stay above `/{document_id}`.

    FastAPI matches in declaration order, so if the dynamic route came first,
    `"trash"` would be parsed as a document id and fail UUID validation with a
    422. `test_trash_route_is_not_parsed_as_a_document_id` guards this.
    """
    documents = await service.list_trash(db, user.id)
    return [DocumentSummary.model_validate(d) for d in documents]
```

- [ ] **Step 5: Run the trash tests**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest tests/test_documents_api.py -v -k trash
```

Expected: 7 tests PASS.

- [ ] **Step 6: Run the whole backend suite**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q
```

Expected: 154 passing (147 existing plus 7). Then run it a second time and confirm the same count — this suite is idempotent and must stay so.

- [ ] **Step 7: Lint and commit**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m ruff check .
```

Expected: "All checks passed!".

```bash
cd D:/AJAIA/Folium
git add backend/
git commit -m "feat(backend): add the trash endpoint for soft-deleted documents"
```

---

### Task 2: The server-side API client

**Files:**
- Create: `frontend/src/lib/api/types.ts`
- Create: `frontend/src/lib/api/server.ts`
- Modify: `frontend/src/lib/api/client.ts`
- Test: `frontend/src/lib/api/server.test.ts`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server`, `ApiError`
- Produces: `DocumentSummary` and `DocumentListResponse` types in `@/lib/api/types`; `serverApiFetch<T>(path, init?)`, `getDocuments()`, `getTrash()` in `@/lib/api/server`

- [ ] **Step 1: Create `frontend/src/lib/api/types.ts`**

```ts
/** Shapes returned by the Folium API. These mirror the backend's Pydantic
 *  schemas exactly; renaming a field here does not rename it there. */

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentListResponse {
  owned: DocumentSummary[];
  shared: DocumentSummary[];
}
```

- [ ] **Step 2: Re-export `UserProfile` from the browser client**

In `frontend/src/lib/api/client.ts`, delete the local `UserProfile` interface and replace it with a re-export, so one definition serves both clients:

```ts
import type { UserProfile } from "./types";

export type { UserProfile } from "./types";
```

Leave `apiFetch` and `getMe` otherwise untouched.

- [ ] **Step 3: Write the failing tests in `frontend/src/lib/api/server.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getSession } }),
}));

const { serverApiFetch } = await import("./server");

describe("serverApiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "server-token" } },
    });
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  });

  it("forwards the token from the cookie-backed session", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await serverApiFetch("/api/v1/documents");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/documents");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer server-token",
    );
  });

  it("reads the session on every call rather than caching it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await serverApiFetch("/a");
    await serverApiFetch("/b");
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("never caches the response between calls", async () => {
    // Server Components render per request; a cached fetch would show one user
    // another user's documents.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await serverApiFetch("/x");
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.cache).toBe("no-store");
  });

  it("raises ApiError carrying the status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not authenticated" }), { status: 401 }),
    );
    await expect(serverApiFetch("/x")).rejects.toBeInstanceOf(ApiError);
    await expect(serverApiFetch("/x")).rejects.toMatchObject({ status: 401 });
  });

  it("keeps 503 distinct from an auth failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "unavailable" }), { status: 503 }),
    );
    await expect(serverApiFetch("/x")).rejects.toMatchObject({ status: 503 });
  });

  it("errors with status 0 when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(serverApiFetch("/x")).rejects.toMatchObject({ status: 0 });
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: FAIL — `./server` does not exist.

- [ ] **Step 5: Create `frontend/src/lib/api/server.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "./errors";
import type { DocumentListResponse, DocumentSummary } from "./types";

/** Call the Folium API from a Server Component.
 *
 * The browser client reads its token from the Supabase browser session, which
 * does not exist on the server; this one reads it from cookies.
 *
 * It uses getSession(), not getUser(), and that is deliberate. Everywhere else
 * this project insists access decisions use getUser(), because getSession()
 * only decodes a cookie a client could have forged. This makes no access
 * decision: middleware has already authenticated the caller with getUser(),
 * and here we need only the raw token to forward. The backend then verifies
 * that token against Supabase's published keys before answering, so a forged
 * one gets a 401 from FastAPI rather than data. getUser() would cost a network
 * round-trip and return no token at all.
 */
export async function serverApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError(0, "Not signed in");
  }

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const response = await fetch(`${base}${path}`, {
    ...init,
    // Never cache: a Server Component renders per request, and a shared cache
    // would serve one user another user's documents.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.clone().json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // Non-JSON error body. Keep the status text.
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) return null as T;
  return (await response.clone().json()) as T;
}

export function getDocuments(): Promise<DocumentListResponse> {
  return serverApiFetch<DocumentListResponse>("/api/v1/documents");
}

export function getTrash(): Promise<DocumentSummary[]> {
  return serverApiFetch<DocumentSummary[]>("/api/v1/documents/trash");
}
```

- [ ] **Step 6: Run the tests**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: 44 passing (38 existing plus 6).

- [ ] **Step 7: Type-check and commit**

```bash
cd D:/AJAIA/Folium/frontend && npx tsc --noEmit
```

Expected: no errors.

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): add a server-side API client for Server Components"
```

---

### Task 3: The dashboard page

**Files:**
- Create: `frontend/src/app/(app)/dashboard/page.tsx`
- Create: `frontend/src/components/documents/DocumentCard.tsx`
- Create: `frontend/src/components/documents/DocumentList.tsx`
- Create: `frontend/src/components/documents/ApiErrorMessage.tsx`
- Modify: `frontend/src/middleware.ts`
- Delete: `frontend/src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getDocuments()`, `DocumentSummary`, `ApiError`
- Produces: `DocumentCard` with props `{ document: DocumentSummary; showOwner?: boolean; action?: React.ReactNode }`; `DocumentList` with props `{ title: string; documents: DocumentSummary[]; emptyMessage?: string; renderAction?: (d: DocumentSummary) => React.ReactNode }`; `ApiErrorMessage` with props `{ error: unknown }`

- [ ] **Step 1: Move `/dashboard` from denied to protected**

In `frontend/src/middleware.ts`, remove `"/dashboard"` from the `RETIRED` array and add it to `PROTECTED`.

`RETIRED` must keep `/api/` and `/documents` — the v1 API routes still mint passwordless sessions, and `/documents/[id]` is still the v1 editor until 2C-ii replaces it.

- [ ] **Step 2: Delete the v1 dashboard page**

```bash
cd D:/AJAIA/Folium && rm frontend/src/app/dashboard/page.tsx
```

Two files cannot both serve `/dashboard`. The rest of the v1 code stays until 2C-iii.

- [ ] **Step 3: Create `frontend/src/components/documents/ApiErrorMessage.tsx`**

```tsx
import { AuthMessage } from "@/components/auth/AuthMessage";
import { ApiError } from "@/lib/api/errors";

/** Render a failed API call in terms the user can act on.
 *
 * 401 and 503 stay distinct deliberately: the backend separates "your session
 * expired" from "the signing keys are unreachable", and collapsing them would
 * make an outage look like every user's credentials failing at once.
 */
export function ApiErrorMessage({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 503) {
    return (
      <AuthMessage kind="error">
        Folium is temporarily unavailable. Try again in a moment.
      </AuthMessage>
    );
  }

  if (error instanceof ApiError && error.status === 401) {
    return (
      <AuthMessage kind="error">
        Your session has expired.{" "}
        <a href="/login" className="underline">
          Sign in again
        </a>
        .
      </AuthMessage>
    );
  }

  return (
    <AuthMessage kind="error">
      Could not load your documents.{" "}
      <a href="/dashboard" className="underline">
        Try again
      </a>
      .
    </AuthMessage>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/documents/DocumentCard.tsx`**

```tsx
import Link from "next/link";

import type { DocumentSummary } from "@/lib/api/types";

export function DocumentCard({
  document,
  action,
}: {
  document: DocumentSummary;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="min-w-0">
        {/* The editor arrives in 2C-ii; the link is correct now and will
            resolve then. */}
        <Link
          href={`/documents/${document.id}`}
          className="block truncate font-medium text-neutral-900 hover:text-carmine-500"
        >
          {document.title}
        </Link>
        <p className="mt-0.5 text-sm text-neutral-500">
          Updated {new Date(document.updated_at).toLocaleDateString()}
        </p>
      </div>
      {action}
    </li>
  );
}
```

- [ ] **Step 5: Create `frontend/src/components/documents/DocumentList.tsx`**

```tsx
import type { DocumentSummary } from "@/lib/api/types";
import { DocumentCard } from "./DocumentCard";

export function DocumentList({
  title,
  documents,
  emptyMessage,
  renderAction,
}: {
  title: string;
  documents: DocumentSummary[];
  emptyMessage?: string;
  renderAction?: (document: DocumentSummary) => React.ReactNode;
}) {
  // A section with nothing in it and nothing to say is noise, so it is omitted
  // entirely rather than shown as an empty heading.
  if (documents.length === 0 && !emptyMessage) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-medium text-neutral-500">{title}</h2>
      {documents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="grid gap-2">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              action={renderAction?.(document)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Create `frontend/src/app/(app)/dashboard/page.tsx`**

```tsx
import Link from "next/link";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { DocumentList } from "@/components/documents/DocumentList";
import { getDocuments } from "@/lib/api/server";
import type { DocumentListResponse } from "@/lib/api/types";

export const metadata = { title: "Your documents — Folium" };

export default async function DashboardPage() {
  let data: DocumentListResponse;
  try {
    data = await getDocuments();
  } catch (error) {
    return <ApiErrorMessage error={error} />;
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Documents</h1>
        <Link href="/trash" className="text-sm text-neutral-500 hover:text-carmine-500">
          Trash
        </Link>
      </div>

      <DocumentList
        title="Your documents"
        documents={data.owned}
        emptyMessage="You have no documents yet."
      />

      {/* No delete action on shared documents: only an owner may delete, which
          the backend enforces, so the button would only ever produce a 404. */}
      <DocumentList title="Shared with you" documents={data.shared} />
    </>
  );
}
```

- [ ] **Step 7: Verify the page renders**

```bash
cd D:/AJAIA/Folium/frontend && npx tsc --noEmit && npm run build
```

Expected: no type errors, "Compiled successfully", and `/dashboard` listed in the route table.

- [ ] **Step 8: Confirm `/dashboard` is no longer 404'd**

Start the backend, then the dev server, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard
```

Expected: **307** (redirect to `/login` when signed out) — **not 404**. A 404 means `/dashboard` is still in the middleware `RETIRED` list.

- [ ] **Step 9: Commit**

```bash
cd D:/AJAIA/Folium
git add -A frontend/
git commit -m "feat(frontend): server-render the dashboard from FastAPI"
```

---

### Task 4: Creating a document

**Files:**
- Create: `frontend/src/components/documents/CreateDocumentButton.tsx`
- Create: `frontend/src/components/documents/CreateDocumentButton.test.tsx`
- Modify: `frontend/src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `apiFetch` from `@/lib/api/client`, `DocumentSummary`
- Produces: `CreateDocumentButton` (no props)

- [ ] **Step 1: Write the failing tests in `frontend/src/components/documents/CreateDocumentButton.test.tsx`**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { CreateDocumentButton } = await import("./CreateDocumentButton");

describe("CreateDocumentButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a document and refreshes the list", async () => {
    apiFetch.mockResolvedValue({ id: "doc-1", title: "Untitled document" });

    render(<CreateDocumentButton />);
    await userEvent.click(screen.getByRole("button", { name: /new document/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/v1/documents", expect.objectContaining({ method: "POST" })),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("disables the button while the request is in flight", async () => {
    let resolve: (v: unknown) => void = () => {};
    apiFetch.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<CreateDocumentButton />);
    const button = screen.getByRole("button", { name: /new document/i });
    await userEvent.click(button);

    // Without this, a double-click creates two documents.
    expect(button).toBeDisabled();
    resolve({ id: "doc-1" });
  });

  it("shows an error and re-enables the button when creation fails", async () => {
    apiFetch.mockRejectedValue(new Error("boom"));

    render(<CreateDocumentButton />);
    await userEvent.click(screen.getByRole("button", { name: /new document/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not create/i);
    expect(screen.getByRole("button", { name: /new document/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: FAIL — `./CreateDocumentButton` does not exist.

- [ ] **Step 3: Create `frontend/src/components/documents/CreateDocumentButton.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import type { DocumentSummary } from "@/lib/api/types";

export function CreateDocumentButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    setCreating(true);
    try {
      await apiFetch<DocumentSummary>("/api/v1/documents", {
        method: "POST",
        body: JSON.stringify({ title: "Untitled document" }),
      });
      // The page is a Server Component, so refreshing re-runs its fetch rather
      // than keeping a second copy of the list in client state.
      router.refresh();
    } catch {
      setError("Could not create the document. Try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {error && <AuthMessage kind="error">{error}</AuthMessage>}
      <Button onClick={create} disabled={creating}>
        {creating ? "Creating…" : "New document"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Add it to the dashboard**

In `frontend/src/app/(app)/dashboard/page.tsx`, import `CreateDocumentButton` and replace the header block with:

```tsx
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Documents</h1>
        <div className="flex items-center gap-4">
          <Link href="/trash" className="text-sm text-neutral-500 hover:text-carmine-500">
            Trash
          </Link>
          <CreateDocumentButton />
        </div>
      </div>
```

- [ ] **Step 5: Run the tests and build**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit && npm run build
```

Expected: 47 passing, no type errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): create documents from the dashboard"
```

---

### Task 5: Deleting with confirmation

**Files:**
- Create: `frontend/src/components/documents/DeleteDocumentDialog.tsx`
- Create: `frontend/src/components/documents/DeleteDocumentDialog.test.tsx`
- Modify: `frontend/src/app/(app)/dashboard/page.tsx`
- Modify: `frontend/package.json` (shadcn `dialog`)

**Interfaces:**
- Consumes: `apiFetch`, `DocumentSummary`
- Produces: `DeleteDocumentDialog` with props `{ document: DocumentSummary }`

- [ ] **Step 1: Add the shadcn dialog component**

```bash
cd D:/AJAIA/Folium/frontend && npx shadcn@latest add dialog -y
```

Then open `frontend/src/components/ui/dialog.tsx` and convert every exported component that renders a DOM element to use `React.forwardRef` with a `displayName`, matching the other files in that directory. shadcn targets React 19, where `ref` is an ordinary prop; on React 18 a ref passed to a plain function component is stripped, and focus management inside a dialog depends on refs reaching their elements.

- [ ] **Step 2: Write the failing tests in `frontend/src/components/documents/DeleteDocumentDialog.test.tsx`**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { DeleteDocumentDialog } = await import("./DeleteDocumentDialog");

const doc = {
  id: "doc-1",
  title: "Quarterly plan",
  owner_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("DeleteDocumentDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not delete until the user confirms", async () => {
    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("names the document so the wrong one is not deleted", async () => {
    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(/quarterly plan/i);
  });

  it("says the document can be restored, because it can", async () => {
    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/trash/i);
    // Deleting is reversible here. Claiming otherwise would make people
    // hesitate over an action they can undo.
    expect(dialog).not.toHaveTextContent(/cannot be undone|permanent/i);
  });

  it("deletes and refreshes once confirmed", async () => {
    apiFetch.mockResolvedValue(null);

    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(await screen.findByRole("button", { name: /move to trash/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/v1/documents/doc-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("treats an already-deleted document as success", async () => {
    const { ApiError } = await import("@/lib/api/errors");
    apiFetch.mockRejectedValue(new ApiError(404, "Document not found"));

    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(await screen.findByRole("button", { name: /move to trash/i }));

    // The user's intent is satisfied. Surfacing an error for "it was already
    // gone" is noise.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: FAIL — `./DeleteDocumentDialog` does not exist.

- [ ] **Step 4: Create `frontend/src/components/documents/DeleteDocumentDialog.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { DocumentSummary } from "@/lib/api/types";

export function DeleteDocumentDialog({ document }: { document: DocumentSummary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/documents/${document.id}`, { method: "DELETE" });
    } catch (err) {
      // A 404 means it is already gone, which is what the user asked for.
      if (!(err instanceof ApiError && err.status === 404)) {
        setError("Could not delete the document. Try again.");
        setDeleting(false);
        return;
      }
    }
    setDeleting(false);
    setOpen(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{document.title}”?</DialogTitle>
          <DialogDescription>
            It moves to the trash, where you can restore it.
          </DialogDescription>
        </DialogHeader>
        {error && <AuthMessage kind="error">{error}</AuthMessage>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          {/* carmine-700, not the brand carmine-500: a destructive action must
              not look like an ordinary primary button. */}
          <Button variant="destructive" onClick={confirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Move to trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Wire it into the owned list only**

In `frontend/src/app/(app)/dashboard/page.tsx`, import `DeleteDocumentDialog` and give the **owned** list a `renderAction`:

```tsx
      <DocumentList
        title="Your documents"
        documents={data.owned}
        emptyMessage="You have no documents yet."
        renderAction={(document) => <DeleteDocumentDialog document={document} />}
      />
```

Leave the shared list without one.

- [ ] **Step 6: Run the tests and build**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit && npm run build
```

Expected: 52 passing, no type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): delete documents with a confirmation dialog"
```

---

### Task 6: The trash page

**Files:**
- Create: `frontend/src/app/(app)/trash/page.tsx`
- Create: `frontend/src/components/documents/RestoreDocumentButton.tsx`
- Create: `frontend/src/components/documents/RestoreDocumentButton.test.tsx`
- Modify: `frontend/src/middleware.ts`

**Interfaces:**
- Consumes: `getTrash()`, `apiFetch`, `DocumentList`, `ApiErrorMessage`
- Produces: `RestoreDocumentButton` with props `{ document: DocumentSummary }`

- [ ] **Step 1: Protect `/trash`**

In `frontend/src/middleware.ts`, add `"/trash"` to the `PROTECTED` array.

- [ ] **Step 2: Write the failing tests in `frontend/src/components/documents/RestoreDocumentButton.test.tsx`**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { RestoreDocumentButton } = await import("./RestoreDocumentButton");

const doc = {
  id: "doc-9",
  title: "Recovered",
  owner_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("RestoreDocumentButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores the document and refreshes", async () => {
    apiFetch.mockResolvedValue({ id: "doc-9" });

    render(<RestoreDocumentButton document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/v1/documents/doc-9/restore",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("disables the button while restoring", async () => {
    let resolve: (v: unknown) => void = () => {};
    apiFetch.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<RestoreDocumentButton document={doc} />);
    const button = screen.getByRole("button", { name: /restore/i });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    resolve({});
  });

  it("shows an error when restoring fails", async () => {
    apiFetch.mockRejectedValue(new Error("boom"));

    render(<RestoreDocumentButton document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not restore/i);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit
```

Expected: FAIL — `./RestoreDocumentButton` does not exist.

- [ ] **Step 4: Create `frontend/src/components/documents/RestoreDocumentButton.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthMessage } from "@/components/auth/AuthMessage";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import type { DocumentSummary } from "@/lib/api/types";

export function RestoreDocumentButton({ document }: { document: DocumentSummary }) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    setError(null);
    setRestoring(true);
    try {
      await apiFetch(`/api/v1/documents/${document.id}/restore`, { method: "POST" });
      router.refresh();
    } catch {
      setError("Could not restore the document. Try again.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div>
      {error && <AuthMessage kind="error">{error}</AuthMessage>}
      <Button variant="ghost" size="sm" onClick={restore} disabled={restoring}>
        {restoring ? "Restoring…" : "Restore"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/src/app/(app)/trash/page.tsx`**

```tsx
import Link from "next/link";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { DocumentList } from "@/components/documents/DocumentList";
import { RestoreDocumentButton } from "@/components/documents/RestoreDocumentButton";
import { getTrash } from "@/lib/api/server";
import type { DocumentSummary } from "@/lib/api/types";

export const metadata = { title: "Trash — Folium" };

export default async function TrashPage() {
  let documents: DocumentSummary[];
  try {
    documents = await getTrash();
  } catch (error) {
    return <ApiErrorMessage error={error} />;
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Trash</h1>
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-carmine-500">
          Back to documents
        </Link>
      </div>

      <DocumentList
        title="Deleted documents"
        documents={documents}
        emptyMessage="Nothing in the trash."
        renderAction={(document) => <RestoreDocumentButton document={document} />}
      />
    </>
  );
}
```

- [ ] **Step 6: Run the tests and build**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit && npm run build
```

Expected: 55 passing, no type errors, `/trash` in the route table.

- [ ] **Step 7: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): add the trash page with restore"
```

---

### Task 7: Signing in lands on the dashboard

**Files:**
- Modify: `frontend/src/lib/auth/redirect.ts`
- Modify: `frontend/src/lib/auth/redirect.test.ts`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/(app)/layout.tsx`
- Modify: `frontend/src/components/auth/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `safeRedirect`, `DEFAULT_REDIRECT`
- Produces: nothing new

- [ ] **Step 1: Change the default destination**

In `frontend/src/lib/auth/redirect.ts`:

```ts
export const DEFAULT_REDIRECT = "/dashboard";
```

Leave `safeRedirect` itself untouched — it validates that a target is a same-origin path and falls back to the default. Only the default changes.

- [ ] **Step 2: Update the redirect tests**

In `frontend/src/lib/auth/redirect.test.ts`, the existing tests assert rejected targets return `DEFAULT_REDIRECT`. They already reference the constant rather than the literal, so they keep passing. Add one test pinning the value, since it is now a product decision rather than an arbitrary default:

```ts
it("defaults to the dashboard", () => {
  expect(DEFAULT_REDIRECT).toBe("/dashboard");
  expect(safeRedirect(null)).toBe("/dashboard");
});
```

If any test hardcodes `"/account"`, change it to `"/dashboard"` — but **do not** change what it asserts. The off-origin cases must still assert *rejection*; that test exists for the open-redirect guard, not the destination.

- [ ] **Step 3: Update the root redirect**

In `frontend/src/app/page.tsx`, change the signed-in destination:

```tsx
  redirect(user ? "/dashboard" : "/login");
```

- [ ] **Step 4: Point the header at the dashboard**

In `frontend/src/app/(app)/layout.tsx`, change the logo link's `href` from `/account` to `/dashboard`, and add an `Account` link beside the sign-out button so the profile page stays reachable:

```tsx
        <div className="flex items-center gap-4">
          <Link href="/account" className="text-sm text-neutral-500 hover:text-carmine-500">
            Account
          </Link>
          <SignOutButton />
        </div>
```

- [ ] **Step 5: Update the login form test**

In `frontend/src/components/auth/LoginForm.test.tsx`, the success test asserts `push` was called with `/account`. Change that expectation to `/dashboard`. The off-origin test asserts `push` was called with `/account` and never the evil URL — change the former to `/dashboard` and **keep the latter assertion exactly as it is**.

- [ ] **Step 6: Run everything**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npx tsc --noEmit && npm run build
```

Expected: 56 passing, no type errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "feat(frontend): land on the dashboard after signing in"
```

---

### Task 8: End-to-end coverage

**Files:**
- Modify: `frontend/e2e/auth.spec.ts`
- Create: `frontend/e2e/documents.spec.ts`

**Interfaces:**
- Consumes: the running frontend and backend
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Update the existing auth expectations**

In `frontend/e2e/auth.spec.ts`, the sign-up and sign-in cases assert the user lands on `/account`. Change those to `/dashboard`. The guard test asserts `redirectTo=%2Faccount`; change it to request `/dashboard` and assert `redirectTo=%2Fdashboard`.

Do not weaken any assertion — only the destination changes.

- [ ] **Step 2: Write `frontend/e2e/documents.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

/** A fresh account per run, so the suite stays idempotent and
 *  backend/scripts/clean_test_data.py can remove what it creates. */
function uniqueEmail() {
  return `e2e-docs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-password-123";

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("a new account sees an empty dashboard, not a blank page", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await expect(page.getByText(/no documents yet/i)).toBeVisible();
});

test("create, delete, find in trash, restore", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: /new document/i }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await page.getByRole("button", { name: /^delete$/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Deleting must not happen until confirmed.
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await dialog.getByRole("button", { name: /move to trash/i }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toHaveCount(0);
  await expect(page.getByText(/no documents yet/i)).toBeVisible();

  await page.getByRole("link", { name: /^trash$/i }).click();
  await expect(page).toHaveURL(/\/trash/);
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await page.getByRole("button", { name: /restore/i }).click();
  await expect(page.getByText(/nothing in the trash/i)).toBeVisible();

  await page.getByRole("link", { name: /back to documents/i }).click();
  // This is the whole point: the server re-rendered because router.refresh()
  // invalidated it, so the restored document is present without a manual reload.
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();
});

test("the trash and dashboard both require signing in", async ({ page }) => {
  await page.goto("/trash");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/nothing in the trash/i)).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 3: Run the suite**

Start the backend in a second terminal:

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Then:

```bash
cd D:/AJAIA/Folium/frontend && npm run e2e
```

Expected: 7 tests pass (4 auth plus 3 documents).

- [ ] **Step 4: Run it a second time to prove idempotency**

```bash
cd D:/AJAIA/Folium/frontend && npm run e2e
```

Expected: 7 pass again. A failure here means data is being reused across runs.

- [ ] **Step 5: Confirm nothing regressed**

```bash
cd D:/AJAIA/Folium/frontend && npm run test:unit && npm test
```

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
```

Expected: 56 Vitest, 14 v1, 154 backend, ruff clean.

- [ ] **Step 6: Commit**

```bash
cd D:/AJAIA/Folium
git add frontend/
git commit -m "test(frontend): cover create, delete, trash, and restore end to end"
```

---

## Definition of done

- [ ] `GET /api/v1/documents/trash` returns only the caller's own soft-deleted documents
- [ ] A user shared into a document never sees it in their trash
- [ ] `/documents/trash` resolves to the trash endpoint, proven by a test rather than route order alone
- [ ] The dashboard server-renders owned and shared documents with no loading state
- [ ] Creating a document adds it to the list without a manual reload
- [ ] Deleting requires confirmation, and the dialog names the document
- [ ] Deleting an already-deleted document is treated as success, not an error
- [ ] Restoring returns a document to the dashboard
- [ ] Shared documents offer no delete action
- [ ] Empty dashboard and empty trash both render a clear prompt, not a blank page
- [ ] A 401 and a 503 produce visibly different messages
- [ ] Signing in lands on `/dashboard`; `/dashboard` and `/trash` redirect when signed out
- [ ] The Phase 2B open-redirect test still asserts rejection of an off-origin `redirectTo`
- [ ] Backend 154, Vitest 56, v1 14, Playwright 7 — Playwright passing twice in a row
- [ ] No v1 file deleted except `src/app/dashboard/page.tsx`
