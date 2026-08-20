# Folium Phase 16 — The editor's writing tools

**Date:** 2026-08-20
**Status:** Implemented
**Scope:** The things Word gives you for working on a *document*, as opposed to a paragraph.

---

## 1. What is actually missing

The editor already does most of Word's formatting: bold, italic, underline, strikethrough, inline
code, highlight, subscript, superscript, three heading levels, quotes, code blocks, rules, three
kinds of list, colour, font, alignment, tables, links and images, with a `/` menu for inserting any
of it.

So "make it more like Word" is not a request for more formatting buttons. What Word has and this
does not is the set of tools for handling a document that has grown long:

| Word | Folium today |
|---|---|
| Find and Replace (Ctrl+F, Ctrl+H) | **Nothing.** The browser's own Ctrl+F cannot see past the viewport in a virtualised editor, and cannot replace |
| Word count in the status bar | Nothing |
| Navigation Pane (jump by heading) | Nothing |
| Change Case | Nothing |
| A list of keyboard shortcuts | Nothing |

Five gaps. Find and replace is the one that matters; the rest are small and obvious once it is
there.

---

## 2. Find and replace

**Ctrl+F opens it, Escape closes it, Enter goes to the next match.** Those are the bindings people
already have in their fingers, and Ctrl+F must be intercepted — the browser's own find genuinely
does not work here, so leaving it to the browser is worse than taking it.

Matches are drawn with **ProseMirror decorations**, the same mechanism comment highlights use: a
view-layer overlay that never touches the document. Searching a document must not be able to change
it, and a decoration cannot.

| Decision | Why |
|---|---|
| Matching is literal, not regex | Regex in a find bar is a power feature with a sharp edge: a stray `(` is an error the user did not ask to debug. The search is over prose |
| Case-insensitive by default, with a toggle | What people mean by "find the" is almost never "find exactly lowercase the" |
| The current match is styled differently from the rest | "3 of 17" is only useful if you can see *which* one is 3 |
| Replace All is one undo step | Otherwise undoing a 200-match replace is 200 keystrokes |
| The bar reports `0 results` rather than hiding | Silence after typing is indistinguishable from a broken control |

**Replace does write the document**, so it is offered only to someone who may edit it. A viewer or a
commenter gets find without replace — which is the useful half, and honest about the other.

---

## 3. The outline

A panel listing every heading in the document, indented by level, that scrolls to one when clicked.
Word calls it the Navigation Pane, and it earns its space on exactly the documents where scrolling
stops working.

- Built from the document as it stands, recomputed as headings change. There is nothing to store.
- **Absent when the document has no headings.** An empty outline panel is a promise about structure
  the document has not made.
- An empty heading shows as "Untitled heading" rather than a blank row you cannot click.

---

## 4. Statistics

Words, characters and reading time, below the editor.

- **Words are counted on the plain text**, splitting on whitespace, which is how every word counter
  disagrees with every other. Ours matches `doc_to_plain_text` on the backend, so what the editor
  says and what a search indexes are the same text.
- **Reading time at 238 words per minute**, the figure from Brysbaert's 2019 meta-analysis of silent
  reading rates, rounded up to the next minute and never shown below "1 min".
- The selection's word count replaces the document's while a selection exists, because that is what
  Word does and what people expect.

---

## 5. Change case

Upper, lower, and Title Case, applied to the selection.

Title Case lowercases the small words — a, an, and, as, at, but, by, for, in, nor, of, on, or, per,
the, to, v, via, vs — **except** when one is the first or last word. That is the rule every style
guide agrees on, and the reason to write it down is that the naive version ("capitalise every word")
produces "The Rise And Fall Of The Roman Empire", which looks wrong to everybody and right to
nobody.

---

## 6. Keyboard shortcuts

A dialog listing what the editor responds to, reachable from the toolbar. Not a feature so much as
an admission: an editor with thirty shortcuts and no list of them has thirty secrets.

---

## 7. What is deliberately not here

- **Regex search.** See §2.
- **Find across documents.** That is search, which Phase 7-i built, and it lives on the dashboard.
- **Footnotes, endnotes, bookmarks, cross-references.** Each needs a document model that can name a
  position durably, which is the problem comments solved with quote anchors precisely because there
  is no such thing here.
- **Format painter.** It needs a notion of "the formatting at a point" that ProseMirror expresses as
  a mark set, and copying that between two arbitrary selections is a bigger feature than it looks.
- **Page layout, margins, headers and footers, page numbers.** Folium documents are not paginated;
  PDF export is the browser's print of a continuous page. Pretending otherwise would be a lie the
  export would then have to keep.
- **Spelling and grammar.** The browser already does spelling in a contenteditable, and grammar is
  a product, not a feature.

---

## 8. Testing

| Layer | Coverage |
|---|---|
| Frontend | Matching: case sensitivity, no matches, overlapping candidates, an empty needle |
| Frontend | The bar reports `n of m`, moves through matches, wraps at the end |
| Frontend | Replace and Replace All; Replace All is a single undo |
| Frontend | Replace is absent for a viewer and a commenter |
| Frontend | The outline lists headings with their level, and is absent when there are none |
| Frontend | Word count, character count, reading time, and the selection case |
| Frontend | Title Case leaves the small words alone, except first and last |
| End to end | Find a word in a real document, replace it, and see the document change |

---

## 9. Definition of done

- [x] Ctrl+F finds, Enter cycles, Escape closes, and the browser's own find never appears
- [x] Replace writes only for someone who may edit
- [x] Replace All is one undo step
- [x] The outline jumps to a heading and hides itself when there are none
- [x] Word count, character count and reading time are shown, and follow a selection
- [x] Nothing here touches the document except replace
- [x] Backend, Vitest and Playwright pass

---

## 10. One thing the build added

**A visible Find button**, next to Export and Shortcuts. The plan had only the
shortcut, and that was wrong: Ctrl+F is the *browser's* shortcut being taken
over, so the only people who would press it are those expecting the thing this
replaces. Nobody discovers an intercepted shortcut. Word puts Find in the
ribbon for the same reason.

It also turned out to be the better thing to test with — the e2e that covers a
viewer opens the bar by clicking it, which is what a viewer would actually do.
