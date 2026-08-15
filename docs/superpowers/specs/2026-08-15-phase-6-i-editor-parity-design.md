# Folium Phase 6-i — Editor parity

**Date:** 2026-08-15
**Status:** Approved, not yet implemented
**Scope:** Close the gap between what the editor can produce and what export can carry, and expose
the block types that have been reachable but invisible since Phase 1.

---

## 1. Context: this phase starts from a bug

The editor is built on TipTap's `StarterKit`, which enables blockquote, code blocks, inline code,
strikethrough, horizontal rules and hard breaks — all of them reachable **today**, by keyboard
shortcut, by input rule (`> `, ` ``` `, `---`), or by paste. None of them appear in the toolbar, so
they have looked like features Folium does not have.

They are not missing. They are unexported. `doc_to_markdown` handles four block types — heading,
paragraph, bulletList, orderedList — and silently skips everything else:

| The user writes | Export produces |
|---|---|
| A blockquote | `""` — the content is gone |
| A code block | `""` — the content is gone |
| `~~struck through~~` | `struck through` — the mark is gone |
| A line break (Shift+Enter) | the two lines run together |

The first two are **data loss**: a document whose body is a quote or a code sample exports as an
empty file. Phase 5-i's definition of done included "an empty document still exports something", and
this is the case that slipped past it, because every test document was built from headings,
paragraphs and lists.

Adding tables and links on top of this would widen a hole rather than build on a floor. So parity
comes first, and the rule that prevents a recurrence comes with it.

---

## 2. The rule this phase establishes

> **Every node and mark the editor's schema permits must have a defined behaviour in both
> converters, and a test that proves it.**

Not "should be handled" — *defined*. Dropping something can be the right answer, but it has to be a
decision with a test naming it, not an omission nobody noticed. The current failure is not that
blockquote is unsupported; it is that nothing anywhere states whether it is.

This is enforced structurally: a test reads the editor's schema list and asserts that the converter
handles every entry. When a future phase adds a table extension, that test fails until the table is
taught to the converter or explicitly listed as excluded. **The test is the whole deliverable** —
without it, the next extension re-opens exactly this hole.

---

## 3. What converts

All of these are ordinary Markdown, so the round trip stays lossless and the importer gains them too
— the two converters are inverses and move together.

| Node or mark | Markdown | Notes |
|---|---|---|
| Blockquote | `> line` | Nested blocks inside a quote are flattened to paragraphs; the editor cannot nest lists in quotes today. |
| Code block | ```` ```lang ```` | The language attribute is preserved when set. |
| Inline code | `` `code` `` | **Escaping is suspended inside**, which is the one genuinely tricky case — see below. |
| Strikethrough | `~~text~~` | GFM, understood everywhere that matters. |
| Horizontal rule | `---` | |
| Hard break | trailing `\` | Two trailing spaces are the classic form and are invisible in a diff and stripped by many editors. A backslash is unambiguous. |

### The escaping problem, which is where the bugs live

Phase 5-i escapes Markdown characters in text so an author's `*` survives. Inside a code span or a
code block that is exactly wrong: the content is literal, and a backslash added there **changes the
code**. `doc_to_markdown` must therefore stop escaping inside code, and the importer must not
unescape there either.

This asymmetry is the most likely source of a silent round-trip failure in this phase, so it gets its
own tests in both directions, including a code block whose body contains `**` and a backslash.

### Fencing

A code block containing ```` ``` ```` breaks a three-backtick fence. The fence therefore grows to
exceed the longest backtick run inside the content, which is what CommonMark specifies.

---

## 4. What is deliberately not converted

**Text alignment, colour, font and size are out of scope**, and not because they are hard. Markdown
cannot express them, so supporting them in the editor would mean either emitting HTML that the
importer must then parse — a real HTML parser, in a converter that is deliberately dependency-free —
or breaking the round-trip guarantee that the export test exists to protect.

They belong to a later phase that decides whether Folium's storage format stays Markdown-compatible
at all. Choosing now, quietly, by adding a colour button, would be the wrong way to decide it.

Underline is the existing exception and stays as it is: `<u>text</u>`, an HTML tag the importer
already round-trips. One exception is a precedent; five are a format change.

---

## 5. The toolbar

The new types are exposed as controls, grouped so the toolbar stays legible rather than becoming a
row of sixteen equal buttons: text formatting, then blocks, then lists.

| Control | Shortcut |
|---|---|
| Strikethrough | `Ctrl/Cmd+Shift+X` |
| Inline code | `Ctrl/Cmd+E` |
| Blockquote | `Ctrl/Cmd+Shift+B` |
| Code block | `Ctrl/Cmd+Alt+C` |
| Horizontal rule | — |

All exist in TipTap already; the buttons make them discoverable. A viewer sees no toolbar, exactly as
now.

---

## 6. Testing

| Layer | Coverage |
|---|---|
| Backend unit | Each new node and mark converts, both directions; escaping is suspended inside code; a fence grows past backticks in the content |
| Backend round trip | The existing test's source document gains every new type, including a code block containing Markdown syntax |
| **Backend schema parity** | **Every node and mark the editor enables is either handled by the converter or named in an explicit exclusion list.** The test that stops this recurring |
| Frontend unit | Each control toggles its command and reflects active state; a viewer sees none of them |
| End to end | A document with a quote, a code block and struck text exports with all three intact — the assertion that would have caught the original bug |

---

## 7. Out of scope

- Links, tables, images, task lists, slash menu — Phase 6-ii.
- Text colour, alignment, fonts — see §4.
- Nested lists, and lists inside blockquotes.
- Syntax highlighting inside code blocks (a display concern; the language is stored either way).

---

## 8. Definition of done

- [ ] A document made of a blockquote exports as a quote, not as an empty file
- [ ] A document made of a code block exports as a fenced block, not as an empty file
- [ ] Strikethrough, inline code, horizontal rules and hard breaks all survive export
- [ ] Markdown characters inside code are **not** escaped, and survive the round trip unchanged
- [ ] A code block containing a triple backtick still fences correctly
- [ ] Re-importing any exported document reproduces it, proven by the extended round-trip test
- [ ] A test fails if a future extension is enabled without a converter decision
- [ ] The toolbar exposes the new types; a viewer still sees no toolbar
- [ ] Backend, Vitest and Playwright pass; Playwright twice in a row
