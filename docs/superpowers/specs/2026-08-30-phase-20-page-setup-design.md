# Folium Phase 20 — The page

**Date:** 2026-08-30
**Status:** Implemented
**Scope:** Give a document a real sheet of paper: size, orientation, margins.

---

## 1. The constraint, stated first

**A browser does not paginate.**

Word knows where page 2 begins because it lays text into fixed-height boxes. A
`contenteditable` is one continuous flow; nothing in CSS tells the editor where
a page would end, and nothing can, because the answer changes with every
keystroke.

This is not a limitation to work around later. It divides the request cleanly:

| Wanted | Possible | Why |
|---|---|---|
| Page width matching real paper | **Yes** | A width is a width |
| Real margins, on screen and on paper | **Yes** | `padding` on screen, `@page` in print |
| Paper size and orientation in the print dialog | **Yes** | `@page` is exactly this |
| Visible page boundaries while editing | No | Requires knowing where a page ends |
| Repeating headers and footers | No | Requires pages to repeat onto |
| "Page 3 of 12" | No | Requires counting pages |
| Mirrored margins | No | Inside/outside needs odd/even pages |

Everything in the "no" column needs a layout engine, not a stylesheet. Google
Docs and Office Online both wrote one; each is a multi-year project.

**The control says so on screen**, in one sentence, where the setting is chosen
— rather than leaving it to be discovered when a printed page does not match.

---

## 2. What the sheet is

A `.folium-page` div: the paper's width, the document's margins as padding, a
white background and a shadow, centred on a grey surround.

**Minimum height, not height.** An empty document should look like a sheet of
paper rather than a strip of one; a long document still has to grow, because
nothing here can decide where a second page would begin.

**On paper the screen imitation gets out of the way entirely.** `@page` has
already applied the margins, so a `.folium-page` still carrying its own padding
would apply them twice and print the document inset by double. The minimum
height goes too, or a document ending halfway down page one forces a blank
page two.

`.folium-prose` caps itself at 78ch so a document on a wide monitor does not run
to 1500px lines. Inside a page that cap is wrong — the margins *are* the measure
— so it is lifted there.

---

## 3. Inches

Word's presets are stated in inches and this exists to match them: `0.75in` is
exact where `19.05mm` is a rounding artefact of it. CSS understands `in`
natively, so the number stored is the number rendered and no conversion sits
between the setting and the page.

---

## 4. Storage

**One `jsonb` column, not six scalar ones.** Size, orientation and the four
margins are a single setting: nothing reads one without the others, nothing
filters or sorts on any of them, and the set grows the moment headers arrive.
Six columns would be six migrations later.

**Nullable, and NULL means "never set up".** That avoids writing a value into
every existing row to say nothing, and keeps a document deliberately set to A4
distinct from one that simply predates the feature — only one of those should
stay in step if the application's default ever changes.

**jsonb enforces nothing**, so `app/schemas/page_setup.py` does. Every field is
bounded and `extra="forbid"` throughout, because *a misspelled key in a jsonb
column is invisible*: it saves, it round-trips, and the setting it was meant to
change simply never applies. Two of the validation tests are misspellings for
that reason.

---

## 5. Who may change it

**Anyone who may edit** — deliberately unlike `folder_id` and `is_template`,
which are owner-only.

Those two are organisation: where a document is filed, and whether it is offered
as a starting point. Page size and margins are **formatting**, the same kind of
decision as alignment or a heading level, and an editor already makes those.

`page_setup` is the fourth field to need `model_fields_set`, after `folder_id`,
`resolved` and `is_template`. `null` means "back to the defaults", which a
content autosave must not do by omission — every keystroke sends a PATCH without
the key.

**A duplicate keeps the page setup**, because formatting travels with a copy
even though organisation does not. A template whose margins do not survive being
used is a template that does not work.

---

## 6. Testing

| Layer | Coverage |
|---|---|
| Unit (pure) | Defaults for null; partial widening; the defaults object is not shared; landscape swaps the axes; Letter and Legal are not confused; content width clamps; every preset is named; a half-typed margin is refused rather than snapped to zero |
| Unit (pure) | The emitted CSS sets `@page`, uses the same margins on screen and paper, and drops padding *and* minimum height when printing |
| Unit (component) | Presets apply and are marked; Mirrored is absent; custom margins commit on blur, not per keystroke; an unreadable field keeps the old value; the pagination limit is stated |
| Backend | Saved, returned, survives a content-only save, resettable with null; six nonsense inputs refused; editor may, viewer may not; a duplicate keeps it; a partial setup is filled in |
| End to end | The sheet measures A4; orientation changes it and persists a reload; a preset changes the text width without moving the sheet; a custom margin survives a reload; a viewer sees the page and gets no control |

---

## 7. Not built, and why

- **Mirrored margins** — see §1.
- **Headers, footers, page numbers** — see §1. These are the ones worth
  revisiting if pagination is ever attempted.
- The rest of the Insert ribbon: shapes, WordArt, SmartArt, charts, icons, 3D
  models, screenshots, online video, signature lines. Each is its own piece of
  work and none depends on this one.

---

## 8. Definition of done

- [x] A document is drawn as its own sheet of paper
- [x] Size, orientation and Word's margin presets, plus custom margins
- [x] The printed page uses the same paper and the same margins
- [x] Stored per document, editor-writable, carried on a duplicate
- [x] The pagination limit is stated in the interface, not just the docs
- [x] Backend, Vitest and Playwright pass
