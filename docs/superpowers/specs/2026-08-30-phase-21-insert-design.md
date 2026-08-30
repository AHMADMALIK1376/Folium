# Folium Phase 21 — Insert

**Date:** 2026-08-30
**Status:** Implemented
**Scope:** Symbols, date and time, bookmarks, cross-references, table of contents.

---

## 1. The organising idea: what a feature costs the schema

Every node or mark added to the editor triggers a chain:
`editor-schema.json` → `editorSchema.test.ts` → `test_editor_parity.py` → the
Markdown converter, in **both** directions, with an exact round trip. That
contract exists because of Phase 6-i, and it is not optional.

So the first question for each of these five was not "how do we build it" but
**"does it need to be in the schema at all"**. Three of the five did not:

| Feature | Schema cost | Why |
|---|---|---|
| Symbol | **None** | A symbol is a character. `±` is as much part of a paragraph as `a` is |
| Date and time | **None** | Inserted as text, then frozen |
| Cross-reference | **None** | It is a `link` whose href is `#name` |
| Bookmark | One mark | "This passage is called `methods`" is not expressible any other way |
| Table of contents | One node | "A contents list goes here" is not either |

That is the whole reason this phase was cheap. A `crossReference` mark would
have bought nothing but a second thing to keep in step with `link`.

---

## 2. The table of contents holds nothing

An atom node with no content and no attributes. The headings are read out of
the document every time it renders, using `outlineOf` — the same function the
Outline panel uses, rather than a second heading walker that could disagree
with it.

**There is no "update this field" anywhere, because there is nothing to
update.** Word needs that prompt precisely because its contents list stores its
entries and can therefore fall out of step with the document. Storing them here
would have bought the same bug.

It also makes the round trip trivial. The node carries no information beyond
"a contents list goes here", so it exports as `<!-- toc -->` — the marker
`markdown-toc` and its imitators already use, so a Folium export still reads as
an ordinary Markdown file — and imports back to precisely itself. **A node with
stored entries would have had to serialise a list of links and re-import it as a
bullet list, which does not round-trip and would have failed the parity
contract.** The design was chosen to fit the contract, not excused from it.

The difference from the Outline panel is what each is *for*: the panel is
navigation and is hidden when printing; this is document content and is printed
with it.

---

## 3. Bookmarks

A mark carrying a name, rendered as `<a id="name">` — an anchor that goes
nowhere and only names a place. `parseHTML` matches `a[id]:not([href])`
precisely so a real link stays a link.

**The name is restricted where it is created, not escaped where it is used.**
It ends up in an `id` attribute and in a URL fragment, so it has to survive
both; slugifying once means nothing downstream has to think about it. The slug
is shown as it is typed, because discovering that "Methods & Materials" became
`methods-materials` afterwards would be worse than watching it happen.

Two refusals, each with a reason on screen:

- A name that slugifies to nothing (`!!!`). Otherwise it becomes a bookmark
  called `""` that nothing can point at, and the failure is invisible until
  someone tries.
- A name already used in the document, because a cross-reference picker showing
  two identical entries cannot be chosen from.

**A bookmark with no name is dropped on export and its words kept** — the same
policy an unsafe link href already has. It is not a bookmark; losing the
author's sentence over it would be a second fault on top of the first.

---

## 4. Dates are text, not fields

Word offers "update automatically", which makes the date change under whoever
opens the document next. That is useful on a letterhead and quietly wrong on a
dated record, which is the more common case here.

Formatted in the reader's locale at the moment of insertion, then frozen as
characters. **The menu says so**, in one line, rather than leaving the behaviour
to be discovered.

ISO 8601 is the one format that is deliberately not localised: it sorts as a
string and means the same thing everywhere.

Every entry is computed from a single `Date`, so the list cannot straddle
midnight and show two different days in the same menu.

---

## 5. Testing

| Layer | Coverage |
|---|---|
| Unit (pure) | No duplicate symbols; every symbol is a single character; search by name, by keyword and by the symbol itself; empty query returns nothing rather than everything |
| Unit (pure) | Date formats have stable ids; ISO is locale-independent and padded; the others are localised; the list cannot straddle midnight |
| Unit (pure) | Slugs strip what an id and a fragment cannot both carry, collapse separators, are bounded, and **do not end on a hyphen after truncation** — a test caught that one |
| Unit (component) | Every control present; symbol inserts text; search says when nothing matches; bookmark disabled with no selection; slug shown live; duplicate and empty names refused; cross-reference inserts a link and clears the mark |
| Backend | Parity contract satisfied for both new schema entries, in both directions, including an exact round trip; a bookmark can also be bold; an unnamed bookmark keeps its words; a cross-reference is just a link |
| End to end | Symbol survives a reload; search by `!=`; date inserted; **contents follows a renamed heading** with no update step; bookmark then cross-reference, both surviving a reload |

---

## 6. Not built

Shapes, WordArt, SmartArt, charts, icons, 3D models, screenshot, online video,
signature lines. Each needs a drawing or editing surface of its own, and none is
a toolbar button.

**Equations** are the one deferred item that belongs with this group rather than
that one: the node is straightforward, but rendering LaTeX needs KaTeX — a real
dependency and a real bundle cost — so it is its own decision.

---

## 7. Definition of done

- [x] A searchable symbol picker, inserting plain text
- [x] Date and time in several formats, frozen and stated as such
- [x] Bookmarks with live slugs and both refusals explained
- [x] Cross-references, as ordinary links to a bookmark
- [x] A table of contents that is derived, not stored
- [x] The parity contract satisfied for both new schema entries
- [x] Backend, Vitest and Playwright pass
