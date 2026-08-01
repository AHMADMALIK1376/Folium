# Folium Phase 5-i — Export

**Date:** 2026-08-01
**Status:** Approved, not yet implemented
**Scope:** Take a document out of Folium — as Markdown, or as a PDF.

---

## 1. Context

Phase 4 finished collaboration, which was the last structural piece. What remains on the roadmap is
polish: attachments and export. Permission levels, listed alongside them, shipped in 2C-iii.

Phase 5 splits, because only one half can be built today:

| | Deliverable | Status |
|---|---|---|
| **5-i** | **This spec.** Export to Markdown and PDF. | This phase |
| 5-ii | Attachments, stored in Supabase Storage | Blocked on a bucket and a service-role key |

Export earns its place ahead of attachments for a plainer reason than ordering: a product that holds
your writing and offers no way to take it out is a product people are right to distrust. Import has
existed since 2C-iii; this is the other half of that door.

---

## 2. Markdown

### The backend converts, as it already does in the other direction

`markdown_to_doc` lives in `app/utils/import_file.py` and has since Phase 1. Its inverse belongs
beside it: one language, one set of tests, and a symmetry that makes a round trip — export a document,
re-import it, get the same document — something that can be tested rather than hoped for.

```
GET /api/v1/documents/{id}/export?format=markdown  ->  text/markdown, as a download
```

Anyone who can view the document may export it. They can already read every word on screen; a copy
they can keep is not a further disclosure.

### What converts, and what cannot

Headings, paragraphs, bold, italic, bullet lists, and ordered lists map directly. Markdown has no
underline, and the editor has one — so an underlined run is emitted as `<u>text</u>`, which every
common renderer accepts and which no plain-Markdown syntax can express. Silently dropping it would
lose something the author deliberately applied.

Markdown's own characters are escaped in text runs, so a paragraph mentioning `*` or `_` survives the
round trip instead of turning into emphasis.

### The filename

Derived from the title — spaces to hyphens, characters a filesystem would refuse removed, `.md`
appended. An untitled or symbol-only title falls back to `document.md` rather than producing a file
called `.md` or one the browser refuses to save.

---

## 3. PDF

### The browser renders it

No PDF library, on either side. An **Export → PDF** action applies a print stylesheet and opens the
browser's print dialog, where every current OS offers *Save as PDF*.

This is a deliberate trade and worth stating rather than glossing:

- **What it costs.** The user chooses the filename in the browser's dialog, not us, and the output
  varies slightly between browsers.
- **What it buys.** Nothing is added to the deployment. Server-side rendering with WeasyPrint means
  GTK system libraries — awkward on Windows, real weight on a free-tier host — for a feature most
  people use rarely. The output also matches what the person is looking at, because it *is* what they
  are looking at.

### The print stylesheet is the actual work

Printing the page as it stands would produce the app: header, toolbar, save status, dialogs, and a
document squeezed into a column. Under `@media print`, everything that is interface disappears and
only the title and the document remain, on a white page with margins the printer respects.

Two details that are wrong by default and have to be fixed: collaboration cursors are absolutely
positioned and would print as stray marks, and a document longer than a page must break between
blocks rather than through the middle of a heading.

---

## 4. The interface

An **Export** control in the editor header, opening a dialog with two choices — the same pattern as
Share and History, so nothing new is introduced and the header gains one button rather than two.

Available to anyone who can open the document, including viewers: exporting is reading.

| Situation | Behaviour |
|---|---|
| Download fails | The shared `ApiErrorMessage` treatment, in the dialog. |
| A document with no content | Exports a file containing just the title. An empty file would look like a failure. |
| Print | The dialog closes first, then the print dialog opens — otherwise the dialog prints too. |

---

## 5. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Backend unit | pytest | Each node type converts; Markdown characters in text are escaped; underline becomes `<u>`; an empty document yields an empty string, not a crash |
| Backend round trip | pytest | `markdown_to_doc(doc_to_markdown(doc))` returns the original document for everything the importer supports — the test that keeps the two honest |
| Backend API | pytest | A viewer may export; a stranger gets 404; the filename is derived and sanitised; an unknown format is refused |
| Frontend unit | Vitest | The dialog offers both; download builds a file from the response; print closes the dialog first |
| End to end | Playwright | Export a document with a heading and a list, and assert the downloaded file's contents |

The round-trip test is the one worth writing carefully. Import and export are the only pair of
functions in this codebase that must agree exactly, and a converter is where quiet asymmetries live.

---

## 6. Out of scope

- Exporting HTML, `.docx`, or plain text.
- Exporting a whole account, or more than one document at once.
- Exporting a specific version from history.
- Print styling beyond a clean document — no headers, footers, or page numbers.
- Attachments, which are 5-ii.

---

## 7. Definition of done

- [ ] A document downloads as Markdown with its formatting intact
- [ ] Re-importing an exported document reproduces it, proven by a test
- [ ] Markdown characters in the text survive the round trip rather than becoming formatting
- [ ] Underline survives, since the editor offers it
- [ ] The filename comes from the title, and never produces an invalid one
- [ ] A viewer can export; a stranger gets 404
- [ ] Printing shows the document alone — no header, toolbar, cursors, or dialogs
- [ ] A long document breaks between blocks, not through a heading
- [ ] An empty document still exports something
- [ ] Backend, Vitest, and Playwright pass; Playwright twice in a row
