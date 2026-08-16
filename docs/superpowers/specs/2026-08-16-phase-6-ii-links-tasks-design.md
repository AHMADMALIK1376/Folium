# Folium Phase 6-ii — Links, task lists, and a slash menu

**Date:** 2026-08-16
**Status:** Approved, not yet implemented
**Scope:** The two content types people miss first, and a faster way to reach every type.

---

## 1. Context

Phase 6-i closed the gap between what the editor could produce and what export could carry, and left
behind a contract — `editor-schema.json`, checked from both sides — that makes adding a type a
deliberate act rather than a silent one. This phase is the first to be built under it.

The editor now has every block `StarterKit` offers. What it does not have is the two things people
reach for immediately in any editor: **a link**, and **a checklist**. Neither is exotic, both are
ordinary Markdown, and their absence is more conspicuous than tables.

The third piece is a **`/` menu**. The request that prompted this phase was for "features like MS
Word", and the honest answer is that a ribbon of thirty buttons is not what makes a modern editor feel
capable — being able to type `/` and reach anything is. It also scales: every type added later appears
in one list instead of making the toolbar longer.

---

## 2. What is in, and what is deliberately not

### In

| Type | Markdown | Notes |
|---|---|---|
| Link | `[text](url)` | A mark, so a link can be bold. |
| Task list | `- [ ]`, `- [x]` | GFM. Two nodes: `taskList` and `taskItem`, with a `checked` attribute. |

Both are ordinary Markdown, so the round trip stays lossless and the contract stays satisfiable —
which is the test any new type has to pass before it belongs in this phase.

### Tables are Phase 6-iii, not an omission

Four node types (`table`, `tableRow`, `tableCell`, `tableHeader`), emission that has to compute column
widths and alignment, an import that has to parse a delimiter row, and an editing surface with insert
and delete for rows and columns. Every part of that is doable and none of it is small. Bundling it
here would mean doing it badly or doing links badly.

### Inline images are blocked on a real design question, not on effort

An image node stores a URL. Attachments live in a **private** bucket and are reached through signed
URLs that expire in five minutes — so a document containing `![](signed-url)` would render for five
minutes and then show broken images **forever**, including in every version-history snapshot that
captured it.

Resolving that means choosing one of:

1. A **public bucket**, which changes the access model — attachments currently follow document
   permission, and a public URL follows nobody.
2. A **redirect endpoint** — `GET /documents/{id}/attachments/{aid}/raw` that checks permission and
   302s to a freshly signed URL. Keeps the model, adds a route, and puts image bytes back through the
   backend on every render.

That is a decision about the security model, and it should be made openly rather than by whoever
implements the image button. It gets its own phase.

---

## 3. Links, and the part that is a security question

A link is the first content type in Folium where **the author supplies something the reader's browser
will act on**. `javascript:` in an `href` is script execution in the reader's session, on a document
they may only have view access to — a stored XSS in a collaborative editor, which is the worst shape
it comes in.

So:

- **An allow-list of protocols**: `http`, `https`, `mailto`. Anything else is refused at the point of
  entry and never reaches the document.
- **The same check on import**, because a `.md` file is untrusted input and the importer is a second
  door into the same document.
- Rendered with `rel="noopener noreferrer"` and `target="_blank"`. `noopener` matters: without it the
  opened page can reach back through `window.opener` and navigate the tab it came from.

This is tested from both directions and in both converters, because a protocol filter that exists only
in the UI is decoration.

**Autolinking is off.** TipTap will happily turn anything that looks like a URL into a link as you
type, which is a surprise in a document that might legitimately contain one as text — and it means a
paste can create links the author never asked for.

---

## 4. The slash menu

Typing `/` at the start of an empty block opens a list; typing filters it; Enter inserts. Escape or a
click elsewhere dismisses it. The list is generated from one array, so a type added in a later phase
appears by adding one entry.

| Behaviour | Reason |
|---|---|
| Only at the start of an empty block | Otherwise every `/` in a URL or a date opens a menu. |
| Keyboard first — arrows, Enter, Escape | It exists to avoid reaching for the mouse; requiring the mouse defeats it. |
| Hidden for viewers | The editor is read-only for them and nothing in the list is available. |
| Filters on typing | `/quo` reaching Quote is the whole point. |

The toolbar stays. The menu is faster for people who know it; the toolbar is discoverable for people
who do not, and neither replaces the other.

---

## 5. Testing

| Layer | Coverage |
|---|---|
| Backend unit | Links and task items convert both ways; `checked` survives; a task item is not read as a bullet; `[` and `]` in text are escaped |
| **Backend security** | `javascript:`, `data:` and `vbscript:` URLs are refused **by the importer**, with the mark dropped and the text kept |
| Backend contract | `editor-schema.json` gains `link`, `taskList`, `taskItem`; the parity test proves each round-trips |
| Frontend unit | The link dialog adds, edits and removes; a disallowed protocol is refused with a message; the slash menu filters, inserts, and closes on Escape |
| End to end | A document with a link and a checklist exports with both intact; a checked box survives a reload |

The parity test from 6-i means these types cannot be added to the schema without a converter decision.
That is the mechanism working as intended, and this phase is its first exercise.

---

## 6. Out of scope

- Tables (6-iii), inline images (blocked, see §2).
- Link previews, or any fetching of link targets.
- Nested task lists.
- Slash-menu entries for anything other than block types — no templates, no snippets.
- Text colour, alignment and fonts, still, and for the reasons Phase 6-i gave.

---

## 7. Definition of done

- [ ] A link can be added, followed, edited and removed, and survives export and re-import
- [ ] `javascript:` and other non-allow-listed protocols are refused in the editor **and** the importer
- [ ] Links render with `rel="noopener noreferrer"`
- [ ] A checklist survives export and re-import, checked state included
- [ ] A task item is never re-imported as a plain bullet
- [ ] `/` opens a filterable menu that inserts every block type, keyboard-only
- [ ] The menu never appears for a viewer
- [ ] `editor-schema.json` covers the new types and both parity tests pass
- [ ] Backend, Vitest, and Playwright pass; Playwright twice in a row
