# Folium Phase 6-ii — Links, task lists, and a slash menu

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a link and a checklist, and a `/` menu that reaches every block type.

**Spec:** `docs/superpowers/specs/2026-08-16-phase-6-ii-links-tasks-design.md`

## Global Constraints

- **The contract comes first.** `editor-schema.json` is updated before the converters, so the parity
  tests fail until each new type has a decision. That mechanism is why 6-i happened; this phase is its
  first use, and working around it would defeat the point.
- **A protocol allow-list is enforced in both the editor and the importer.** A filter that exists only
  in the UI is decoration — a `.md` file is untrusted input and the importer is a second door.
- **Escaping stays suspended inside code.** `[` and `]` become delimiters this phase; inside a code
  span they must remain literal.
- Baselines to protect: backend **304**, Vitest **225**, Playwright **30** (twice, no skips).
  ruff, tsc, build clean.

---

### Task 1: Install, and extend the contract

**Files:**
- Modify: `frontend/package.json`, `editor-schema.json`
- Test: `frontend/src/components/editor/editorSchema.test.ts`, `backend/tests/test_editor_parity.py`

- [ ] **Step 1: Add the extensions and watch both parity tests fail**

`@tiptap/extension-link`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, wired into
`DocumentEditor`. The frontend test fails because the real bundle no longer matches the contract; add
`link`, `taskList`, `taskItem` to the file and the backend test fails because the converter has no
decision for them. **Both failures are the mechanism working** — record them rather than skipping to
the fix.

`taskItem` is excluded in the contract like `listItem`: it is rendered by its parent.

- [ ] **Step 2: Verify both fail for the right reason, then implement Tasks 2–3**

---

### Task 2: Convert links

**Files:**
- Modify: `backend/app/utils/import_file.py`
- Test: `backend/tests/test_export_markdown.py`, `backend/tests/test_import_file.py`

- [ ] **Step 1: Failing tests**

1. `[text](url)` both directions, including a link carrying bold.
2. `[` and `]` in ordinary text are escaped, and survive the round trip.
3. **Inside a code span they are not escaped.**
4. A link whose text contains `]` does not truncate.
5. **`javascript:`, `data:` and `vbscript:` are refused on import** — the mark is dropped and the text
   kept, rather than the paragraph being discarded. Losing an author's words to a bad URL would be a
   second bug.
6. A relative URL and a `mailto:` are allowed.

- [ ] **Step 2: Implement**

One `ALLOWED_PROTOCOLS` constant shared by the import path and exposed for the frontend to mirror. A
URL with no scheme is relative and allowed; a scheme not on the list is refused.

- [ ] **Step 3: Verify and commit**

---

### Task 3: Convert task lists

**Files:**
- Modify: `backend/app/utils/import_file.py`
- Test: `backend/tests/test_export_markdown.py`, `backend/tests/test_import_file.py`

- [ ] **Step 1: Failing tests**

1. `- [ ]` and `- [x]` both directions, with `checked` preserved.
2. **A task item is matched before a bullet.** `BULLET_RE` matches `- [ ] milk` as a bullet whose text
   is `[ ] milk`, so order is the whole correctness argument here.
3. A bullet list and a task list next to each other stay two separate nodes.
4. `- [X]` uppercase is read as checked.
5. A paragraph that merely begins `[ ]` is not turned into a task.

- [ ] **Step 2: Implement, then run the parity test**

It should now pass for all three new types. If it does not, the converter is wrong.

- [ ] **Step 3: Verify and commit**

---

### Task 4: The link control

**Files:**
- Create: `frontend/src/components/editor/LinkDialog.tsx` and its test
- Modify: `frontend/src/components/editor/EditorToolbar.tsx` and its test

- [ ] **Step 1: Failing tests**

1. Adds a link to the selection; the URL is what was typed.
2. Editing an existing link pre-fills its URL; removing it unsets the mark.
3. **A `javascript:` URL is refused with a message and no mark is applied.**
4. A URL with no scheme gains `https://` rather than being refused — typing `example.com` is what
   people do.
5. The control shows as active when the caret is inside a link.

- [ ] **Step 2: Implement**

`Link.configure({ openOnClick: false, autolink: false, protocols: [...] })`. Autolink off: it creates
links the author never asked for, including on paste.

- [ ] **Step 3: Verify and commit**

---

### Task 5: The slash menu — DEFERRED to 6-iii

> **Deferred deliberately, not abandoned.** Links and task lists are two content
> types with converter work, a security boundary, and a schema contract to
> satisfy on both sides; the slash menu is a keyboard surface over commands that
> now all exist. Bundling them meant either rushing the menu or delaying two
> finished types behind it.
>
> It is also the one piece here with no data at stake — nothing it inserts is new,
> so shipping it later costs nothing but convenience, whereas a half-built menu
> that mis-inserts blocks costs trust in the editor.
>
> The toolbar already exposes every type, so nothing is unreachable in the
> meantime.

**Files:**
- Create: `frontend/src/components/editor/SlashMenu.tsx` and its test
- Modify: `frontend/src/components/editor/DocumentEditor.tsx`

- [ ] **Step 1: Failing tests**

1. `/` at the start of an empty block opens it; `/` mid-sentence does not.
2. Typing filters; `/quo` reaches Quote.
3. Arrows move the selection, Enter inserts, Escape closes without inserting.
4. The typed `/query` text is removed when an item is inserted.
5. Never rendered for a viewer.

- [ ] **Step 2: Implement, driven by one array**

Each entry is `{ label, keywords, run(editor) }`. A type added later is one entry, not a new component.

- [ ] **Step 3: Verify and commit**

---

### Task 6: End to end

**Files:**
- Create: `frontend/e2e/rich-editing.spec.ts`

- [ ] **Step 1: A link and a checklist, exported**

Assert the file contains `[text](url)` and `- [x]`. Scope any alert query to its panel — an unscoped
`getByRole("alert")` also matches Next.js's route announcer, which cost three runs in 6-i.

- [ ] **Step 2: A checked box survives a reload**

- [ ] **Step 3: Run everything twice, then commit**

---

### Task 7: Documentation

- [ ] README: the converter table gains links and task lists; the slash menu gets a mention; the
  protocol allow-list is stated as a security property rather than left implicit.
- [ ] Ledger: archive 6-i's, open 6-ii's, and record why inline images are blocked.

---

## Definition of done

Mirrors the spec's, which is the authority.
