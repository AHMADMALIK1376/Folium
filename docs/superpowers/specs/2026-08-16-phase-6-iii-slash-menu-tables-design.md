# Folium Phase 6-iii — The slash menu (and tables, deferred)

**Date:** 2026-08-16
**Status:** Slash menu shipped. Tables carried forward to 6-iv.
**Scope:** A `/` menu that reaches every block type.

> **Split during implementation, and the table above is why.** The two halves were written into one
> spec because they answer the same request, and separated once the risk column was filled in: the
> menu changes no schema, touches no converter, and runs only commands that already existed, while
> tables add four node types and emission in both directions. Shipping the zero-risk half immediately
> is strictly better than holding it behind the half that needs care. §3 stays as the design tables
> will be built from.

---

## 1. Two halves with very different risk

| | Schema | Converters | Risk |
|---|---|---|---|
| **Slash menu** | unchanged | none | None. Every command it runs already exists and already has a toolbar button. |
| **Tables** | +4 nodes | both directions, with alignment | Real. Four node types, a delimiter row to parse, and column widths to compute. |

They are in one phase because they are the same request — "make the editor feel capable" — but they are
built and committed separately, and the menu goes first precisely because it cannot break anything.

---

## 2. The slash menu

Typing `/` at the start of an empty block opens a filterable list; typing narrows it; Enter inserts;
Escape closes. It is generated from one array, so a type added later is one entry rather than a
component change.

| Rule | Why |
|---|---|
| Only at the start of an **empty** block | Otherwise every `/` in a URL or a date opens a menu mid-sentence. |
| Keyboard-first: arrows, Enter, Escape | It exists to avoid the mouse; needing the mouse defeats it. |
| The typed `/query` is removed on insert | Otherwise the command text stays in the document. |
| Absent for viewers | Nothing in it is available to them. |
| The toolbar stays | The menu is faster once known; the toolbar is discoverable. Neither replaces the other. |

**Why not a ribbon.** The request that started this was "features like MS Word". Thirty buttons is
what Word looks like, not what makes it capable — and it scales badly: every future type makes the
toolbar longer. A `/` menu absorbs new types at no visual cost.

---

## 3. Tables

### What converts

GitHub-flavoured Markdown, which is what every renderer that matters understands:

```
| Name | Role |
|------|------|
| Ana  | Lead |
```

The header row is **not optional in GFM** — a table without one has no delimiter row, and without a
delimiter row it is not a table but a set of paragraphs containing pipes. TipTap can produce a
headerless table, so export writes the first row as the header rather than emitting something that
re-imports as prose. That is a lossy edge, and it is stated here rather than discovered.

### The parts that will go wrong

- **A pipe inside a cell** ends the cell. It is escaped as `\|`, and unescaped on the way back.
- **Cells are not padded to equal width.** Aligning them makes a prettier file and a worse diff:
  every edit to one cell rewrites the whole column. Single spaces, always.
- **A row with fewer cells than the header** is padded on import rather than refused, because a
  hand-written file is allowed to be untidy.
- **Nested block content in a cell** — a list inside a cell — cannot be expressed in GFM. Cell content
  is flattened to inline text on export, and this is the one place this phase knowingly loses
  structure.

### Alignment

`:---`, `:---:`, `---:` map to TipTap's cell alignment where set, and to none where not. This is the
only place alignment enters the product, and it is here because **GFM can express it** — unlike the
text alignment Phase 6-i refused, which Markdown cannot represent at all. The distinction is the
whole reason one is in and the other is out.

---

## 4. Testing

| Layer | Coverage |
|---|---|
| Backend unit | A table converts both ways; a pipe in a cell survives; a short row is padded; alignment round-trips |
| Backend contract | `editor-schema.json` gains the four nodes; the parity test proves each round-trips |
| Frontend unit | The menu opens only on an empty block, filters, inserts, and closes on Escape; each command runs |
| End to end | A table survives export; the menu inserts a quote |

---

## 5. Out of scope

- Merged cells (`colspan`/`rowspan`), which GFM cannot express at all.
- Block content inside cells — see §3.
- Column resizing.
- Inline images, still blocked on the signed-URL question recorded in 6-ii.

---

## 6. Definition of done

- [ ] `/` opens a filterable menu on an empty block and nowhere else
- [ ] It inserts every block type, by keyboard alone, and removes the typed query
- [ ] It never appears for a viewer
- [ ] A table survives export and re-import, alignment included
- [ ] A pipe inside a cell survives
- [ ] `editor-schema.json` covers the table nodes and both parity tests pass
- [ ] Backend, Vitest, and Playwright pass; Playwright twice in a row
