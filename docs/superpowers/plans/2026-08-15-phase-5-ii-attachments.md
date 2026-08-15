# Folium Phase 5-ii — Attachments

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach files to a document, stored in Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-08-15-phase-5-ii-attachments-design.md`

## Global Constraints

- **A blank `SUPABASE_SERVICE_ROLE_KEY` turns the feature off**, exactly as a blank y-sweet string
  does. CI holds no Supabase credentials and the whole suite must still pass.
- **The storage boundary is one module, replaced wholesale in tests.** No test may need a bucket, a
  key, or a network. `app/services/collab.py::_mint` is the precedent.
- **404, never 403** — including an attachment id belonging to another document.
- **Never trust the request's `Content-Type`.** Derive it from the extension.
- Baselines to protect: backend **217**, Vitest **193**, Playwright **26** with collaboration on.
  ruff, tsc, build clean.

---

### Task 1: The bucket, and the key

**Files:**
- Modify: `backend/app/config.py`, `backend/.env.example`
- Create: `backend/scripts/create_storage_bucket.py`
- Test: `backend/tests/test_config.py`

- [x] **Step 1: Config**

`supabase_service_role_key: str = ""`, with `attachments_enabled` beside `is_development` as a
property. Rewrite the comment in `config.py` that says this service deliberately holds no admin
credential — it is about to, and a stale comment that contradicts the code is worse than none.

- [x] **Step 2: The bucket is a script, not a migration**

CI runs plain PostgreSQL with no `storage` schema, so a migration touching `storage.buckets` would
fail every CI run. It is also not application schema. A small idempotent script creates the private
bucket and is documented in README and DEPLOY.

- [x] **Step 3: Verify and commit**

---

### Task 2: The storage client

**Files:**
- Create: `backend/app/services/storage.py`
- Test: `backend/tests/test_storage_service.py`

**Interfaces:** `upload(path, data, content_type)`, `signed_url(path, expires_in)`, `remove(paths)`

- [x] **Step 1: Failing tests**

1. A blank key raises `StorageUnavailableError` rather than calling out.
2. Each call targets the documented Supabase Storage REST path and carries the service key.
3. A non-2xx response raises `StorageUnavailableError`, not a bare `httpx` error.
4. `remove` tolerates an already-absent object.

- [x] **Step 2: Implement**

`httpx.AsyncClient` with an explicit timeout — the ledger records that y-sweet's `create_doc` has
none and that this is a known hazard; do not repeat it. `StorageUnavailableError` subclasses
`FoliumError` and maps to **503**, the same line Phase 2A drew for JWKS: infrastructure failure must
never read as an access decision.

- [x] **Step 3: Verify and commit**

---

### Task 3: Attachment rules and the service

**Files:**
- Create: `backend/app/services/attachments.py`, `backend/app/schemas/attachment.py`
- Test: `backend/tests/test_attachments_service.py`

- [x] **Step 1: Failing tests, all pure**

1. `content_type_for("a.PNG")` is `image/png`; case-insensitive.
2. `.svg`, `.exe`, and an extensionless name are refused — SVG explicitly, since it is an image and
   the refusal is deliberate rather than an oversight.
3. `storage_path(document_id, attachment_id, ".png")` contains neither the filename nor any `..`.
4. Over 10MB is refused; the 20-per-document cap is refused.

- [x] **Step 2: The service**

`list_attachments`, `create_attachment`, `attachment_url`, `delete_attachment`. Each resolves the
document first through `documents.get_document`, which already raises `NotFoundError` for a stranger —
so permission is inherited rather than reimplemented. Edit-level actions re-check with `can_edit` and
raise `NotFoundError`, not `PermissionDeniedError`.

- [x] **Step 3: Verify and commit**

---

### Task 4: The endpoints

**Files:**
- Create: `backend/app/api/v1/attachments.py`
- Modify: `backend/app/api/v1/router.py`, `backend/app/main.py` (503 handler)
- Test: `backend/tests/test_attachments_api.py`

- [x] **Step 1: Failing tests, against a fake storage client**

1. Upload returns 201 and the row; list shows it.
2. A viewer may list and fetch a URL, but upload and delete are 404.
3. A stranger gets 404 on every route.
4. An attachment id from another document is 404, not 403.
5. Oversized and disallowed files are refused.
6. With no key, every route is 503.
7. Unauthenticated is 401.

- [x] **Step 2: Implement**

> **Changed during implementation.** This step originally said "and clean up on permanent delete".
> There is no permanent delete in Folium — `DELETE /documents/{id}` is a soft delete into a trash
> folder built to be undone, so a document's files must *outlive* it. Writing the cleanup anyway
> would have shipped a function with no caller. The one place rows genuinely disappear is
> `scripts/clean_test_data.py`, which hard-deletes test accounts; it removes their objects itself,
> best effort. The spec was corrected to match.

- [x] **Step 3: Verify and commit**

---

### Task 5: The frontend

**Files:**
- Create: `frontend/src/components/editor/AttachmentsPanel.tsx` and its test
- Modify: `frontend/src/lib/api/documents.ts` and its test, `frontend/src/lib/api/types.ts`
- Modify: `frontend/src/components/editor/DocumentEditor.tsx`

- [x] **Step 1: Fetchers with tests**

`listAttachments`, `uploadAttachment` (multipart — `apiFetch` already handles FormData), `attachmentUrl`,
`deleteAttachment`.

- [x] **Step 2: Failing tests for the panel**

1. Renders what is attached, with size.
2. A viewer sees no upload control and no remove control.
3. A failed upload shows `ApiErrorMessage` and leaves the list intact.
4. Too large or wrong type is rejected without a request being made.
5. Absent entirely when the feature is off.

- [x] **Step 3: Implement, and wire below the editor**

Not a dialog. Hidden when `attachmentsEnabled` is false — the editor learns this from the document
payload rather than guessing.

- [x] **Step 4: Verify and commit**

---

### Task 6: End to end

**Files:**
- Create: `frontend/e2e/attachments.spec.ts`

- [x] **Step 1: Upload, list, download, delete**

Assert the downloaded bytes match what was uploaded. `test.skip` when no key is configured — and note
that `collaboration.spec.ts` reads its flag from the **Playwright** process, which silently skips when
only the backend is configured. Do not repeat that trap: document the variable in the README.

> **Improved on the plan.** Rather than reading an environment variable at all, the spec asks the
> *application* whether the attachments panel is there — a flag the backend computed from its own
> configuration. An env var in the Playwright process can disagree with the backend; the rendered
> panel cannot.

- [x] **Step 2: A viewer can download but not change**

- [x] **Step 3: Run everything twice, then commit**

---

### Task 7: Documentation

- [x] README: an Attachments section, the limits, the bucket setup, and the env var.
- [x] DEPLOY: the service-role key and the bucket as deployment prerequisites.
- [x] ARCHITECTURE: the storage boundary, and why permission stays in the backend.
- [x] Ledger: archive 5-i's, open 5-ii's.

---

## Definition of done

Mirrors the spec's, which is the authority.
