# Folium Phase 6-i — Editor parity

> **For agentic workers:** implement task-by-task, tests first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything the editor can produce survives export, and the toolbar admits it exists.

**Spec:** `docs/superpowers/specs/2026-08-15-phase-6-i-editor-parity-design.md`

## Global Constraints

- **This phase starts from data loss, not from a feature request.** A blockquote or a code block
  currently exports as an empty file. Fixing that outranks anything else here.
- **The two converters are inverses and move together.** A type added to one is added to the other in
  the same task, and the round-trip test is what proves it.
- **Escaping is suspended inside code**, in both directions. A backslash added to a code sample
  changes the code.
- Baselines to protect: backend **259**, Vitest **212**, Playwright **26** (+3 attachment skips).
  ruff, tsc, build clean.

---

### Task 1: The parity test, first

**Files:**
- Test: `backend/tests/test_export_markdown.py`
- Create: `backend/app/utils/schema.py` (or a constant beside the converters)

- [ ] **Step 1: Write the test that would have caught the bug**

A single list of every node and mark the editor enables — mirroring `DocumentEditor.tsx`'s extension
list — and a test asserting each is either converted or in a named exclusion set. It must fail now,
against `blockquote`, `codeBlock`, `code`, `strike`, `horizontalRule` and `hardBreak`.

This task comes first deliberately: it is the deliverable that stops Phase 6-ii re-opening the hole,
and writing it last would mean writing it to match whatever got built.

- [ ] **Step 2: Confirm it fails for the right six, then commit it failing or with the fix**

---

### Task 2: Export the missing types

**Files:**
- Modify: `backend/app/utils/import_file.py`
- Test: `backend/tests/test_export_markdown.py`

- [ ] **Step 1: Failing tests**

1. Blockquote becomes `> `, one prefix per line, and a multi-paragraph quote keeps both.
2. Code block becomes a fence; `attrs.language` becomes the info string when present.
3. A code block containing ```` ``` ```` gets a longer fence.
4. Inline code becomes backticks, and **its content is not escaped** — `` `a*b` `` stays `a*b`.
5. Strike becomes `~~`, and nests with bold and italic innermost-first as the existing marks do.
6. Horizontal rule becomes `---`.
7. Hard break becomes a trailing `\` and does not merge the lines.
8. An empty code block is still a fence, not an empty string.

- [ ] **Step 2: Implement**

`_inline_to_markdown` gains `code` and `strike`; `code` must short-circuit escaping rather than layer
a mark on escaped text, which is why it is handled before the mark loop rather than inside it.

- [ ] **Step 3: Verify and commit**

---

### Task 3: Import them back

**Files:**
- Modify: `backend/app/utils/import_file.py`
- Test: `backend/tests/test_import_file.py`, `backend/tests/test_export_markdown.py`

- [ ] **Step 1: Failing tests**

1. `> ` becomes a blockquote; consecutive quoted lines become one.
2. A fence becomes a code block, with the info string as `attrs.language`.
3. **Nothing inside a fence is parsed as Markdown** — a `# ` inside a code block stays text, and this
   is the test most likely to fail first, since the line loop currently matches headings anywhere.
4. `~~` and `` ` `` become marks; a backtick span suspends unescaping.
5. `---` becomes a horizontal rule, and is not confused with a `-` bullet.
6. A trailing `\` becomes a hard break.

- [ ] **Step 2: Implement**

The line loop gains a fence state, checked before every other rule. Everything else is a line-level
match as today.

- [ ] **Step 3: Extend the round trip, which is the point**

`SOURCE` in the round-trip test gains a quote, a fenced block containing `**not bold**` and a `#`, a
struck run, an inline code span containing `*`, a rule, and a hard break.

- [ ] **Step 4: Verify and commit**

---

### Task 4: The toolbar

**Files:**
- Modify: `frontend/src/components/editor/EditorToolbar.tsx` and its test

- [ ] **Step 1: Failing tests**

Each control toggles the right command and reflects active state; the group labels exist; a viewer
sees no toolbar at all (unchanged, and worth re-asserting).

- [ ] **Step 2: Implement, grouped**

Text marks, then blocks, then lists, with separators — not sixteen identical buttons in a row.

- [ ] **Step 3: Verify and commit**

---

### Task 5: End to end

**Files:**
- Modify: `frontend/e2e/export.spec.ts`

- [ ] **Step 1: The assertion that would have caught this**

Build a document containing a quote, a code block and struck text; export; assert all three appear in
the file. The existing spec asserts only `# ` and `- `, which is why it passed throughout.

- [ ] **Step 2: Run everything twice, then commit**

---

### Task 6: Documentation

- [ ] README: the import/export table gains the new types, and the limitation is narrowed rather than
  deleted — alignment and colour are still unsupported, and now deliberately.
- [ ] Ledger: archive 5-ii's, open 6-i's, and record the escaping-inside-code trap.

---

## Definition of done

Mirrors the spec's, which is the authority.
