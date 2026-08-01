# Folium Phase 5-i — Export

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download a document as Markdown, or print it as a PDF.

**Spec:** `docs/superpowers/specs/2026-08-01-phase-5-i-export-design.md`

## Global Constraints

- **The converter is the inverse of `markdown_to_doc`**, lives beside it, and is proven by a round-trip test. If the two disagree, the converter is wrong, not the test.
- Export follows **view** permission: anyone who can read the document can take a copy.
- No PDF library. Printing is the browser's, driven by a stylesheet.
- Two `role="status"` live regions already exist in the editor; queries need `{ name: ... }`.
- Baselines: backend **189**, Vitest **179**, Playwright **24** with collaboration on / **22 + 2 skipped** without. ruff, tsc, build clean.

---

### Task 1: Markdown conversion

**Files:**
- Modify: `backend/app/utils/import_file.py`
- Test: `backend/tests/test_export_markdown.py`

**Interfaces:** `doc_to_markdown(doc) -> str`

- [ ] **Step 1: Failing tests**

1. A heading becomes `#`, `##`, `###` by level.
2. Paragraphs separate with a blank line.
3. Bold is `**`, italic `*`, underline `<u>` — Markdown has no underline and the editor has one.
4. Bullet items become `-`, ordered items `1.`, `2.`, numbered in sequence rather than all `1.`.
5. **Markdown characters in text are escaped**, so a paragraph containing `*not italic*` survives.
6. An empty document returns `""` rather than raising.
7. Malformed input — a node that is not a dict, `content` that is not a list — returns what it can rather than raising, matching `doc_to_plain_text`'s defensiveness.

- [ ] **Step 2: The round-trip test, which is the point**

```python
def test_markdown_survives_a_round_trip():
    original = markdown_to_doc(SOURCE)
    assert markdown_to_doc(doc_to_markdown(original)) == original
```

`SOURCE` covers everything the importer supports: both heading levels, bold, italic, a bullet list, an ordered list, and a paragraph containing an asterisk. This is the test that keeps import and export honest — a converter is exactly where quiet asymmetries live.

- [ ] **Step 3: Implement**

Walk blocks, then inline runs. Marks nest innermost-first so `**_both_**` round-trips. Escape `\\`, `` ` ``, `*`, `_`, `[`, `]`, `#` at the start of a line — but not inside a code span, of which there are none, since the editor has no code mark.

- [ ] **Step 4: Verify and commit**

```bash
cd D:/AJAIA/Folium/backend && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
```

---

### Task 2: The export endpoint

**Files:**
- Create: `backend/app/api/v1/export.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_export_api.py`

**Interfaces:** `GET /api/v1/documents/{id}/export?format=markdown`

- [ ] **Step 1: Failing tests**

1. Returns 200, `text/markdown`, and a `Content-Disposition: attachment` carrying a filename.
2. The filename derives from the title: spaces to hyphens, unsafe characters removed, `.md`.
3. A title of only symbols falls back to `document.md` — never a bare `.md`, which browsers refuse.
4. A viewer may export. Reading is what they are allowed to do.
5. A stranger gets 404, consistent with every other document route.
6. An unrecognised `format` is 422 rather than silently returning Markdown.
7. Unauthenticated is 401.

- [ ] **Step 2: Implement**

`format` is a `Literal["markdown"]` query parameter, so FastAPI rejects anything else with a 422 before the handler runs — no hand-written validation, and PDF is not a value because the browser makes those.

Filename sanitising is its own small function so it can be tested directly: strip path separators and control characters, collapse whitespace, cap the length, and fall back when nothing usable remains.

- [ ] **Step 3: Verify and commit**

---

### Task 3: The export dialog

**Files:**
- Create: `frontend/src/components/editor/ExportDialog.tsx` and its test
- Modify: `frontend/src/lib/api/documents.ts` and its test
- Modify: `frontend/src/components/editor/DocumentEditor.tsx`

- [ ] **Step 1: A fetcher that returns a file, with tests**

`exportMarkdown(id)` requests the endpoint and returns the body as a `Blob` — `apiFetch` parses JSON, so this uses it for the token and reads the response itself, or gains a small variant. Assert it does not attempt to parse Markdown as JSON.

- [ ] **Step 2: Failing tests for the dialog**

1. Offers Markdown and PDF.
2. Markdown triggers a download with a filename taken from the response's `Content-Disposition`, falling back to the title.
3. A failed download shows `ApiErrorMessage` and leaves the dialog open.
4. PDF closes the dialog **before** calling print — otherwise the dialog is what gets printed.
5. A viewer sees both options: exporting is reading.

Stub `window.print` and the anchor click; jsdom implements neither.

- [ ] **Step 3: Implement, and wire into the header**

Beside History. Available whatever the permission.

- [ ] **Step 4: Verify and commit**

---

### Task 4: The print stylesheet

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Hide the application, keep the document**

Under `@media print`: hide the app header, the editor's own header row, the toolbar, both status indicators, and any open dialog. Show the document title as a heading, then the content.

- [ ] **Step 2: The two details that are wrong by default**

- **Collaboration cursors print as stray marks** — they are absolutely positioned overlays. Hide `.collaboration-cursor__caret` and `.collaboration-cursor__label`.
- **A long document breaks mid-heading.** `break-after: avoid` on headings and `break-inside: avoid` on list items.

Also drop the editor's minimum height, which would otherwise force a mostly-blank first page, and set a white background.

- [ ] **Step 3: Verify**

Build, then check in a browser with the print preview open. A screenshot is not enough — print styles do not apply to the screen.

---

### Task 5: End to end

**Files:**
- Create: `frontend/e2e/export.spec.ts`

- [ ] **Step 1: Download and read the file**

Playwright's `waitForEvent("download")` plus `createReadStream`. Create a document with a heading and a list, export it, and assert the file's text contains `# ` and `- `. Asserting the *contents* rather than that a download happened is what makes this worth running.

- [ ] **Step 2: A viewer can export**

Share as view, and export from the guest's browser.

- [ ] **Step 3: Run everything twice, then commit**

---

### Task 6: Documentation

- [ ] README: an Export section covering both formats and the fact that PDF is the browser's print dialog.
- [ ] Ledger: archive 4-ii's, open 5-i's, and record that 5-ii is blocked on a bucket and a service-role key.

---

## Definition of done

Mirrors the spec's, which is the authority.
