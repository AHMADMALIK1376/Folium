# Folium Phase 19 — A palette, a size, and the fourth alignment

**Date:** 2026-08-30
**Status:** Implemented
**Scope:** Close the most visible gaps between Folium's editor and the Word Home tab.

---

## 1. What was asked, and what was already there

The request was for a colour palette and "more editing components like MS Word".
Before proposing anything, the existing toolbar was measured against the Word
ribbon. Most of it was already built: bold, italic, underline, strikethrough,
sub- and superscript, highlight, clear formatting, headings, quote, code block,
bullets, numbering, a checklist Word does not have, three alignments, find and
replace, and a font family control.

Four things were genuinely missing or wrong:

| Gap | Why it mattered |
|---|---|
| Colour was a `<select>` of colour **names** | Choosing "Amber" from a dropdown means reading a word and imagining a colour |
| **No font size at all** | The most conspicuous absence — Word's `12` box has no counterpart |
| Highlight was one fixed yellow | `Highlight` was configured with no options, so `multicolor` was off |
| **No justify** | The engine already supported it; only the button was missing |

Everything else on the Home tab was recorded as deliberate scope, not oversight —
see §7.

---

## 2. The palette

**A grid of the colours themselves, not their names.** Twelve for text, twelve
for highlight, opened from a toolbar button in a popover.

The palette stays **fixed** rather than opening a full picker. Every text swatch
is legible on white and every highlight swatch is pale enough to sit behind
black text. A picker invites pale yellow on a white page, and a document nobody
can read is not more expressive. That is a limit chosen on purpose.

**There is one Highlight control, not two.** The first build of this left the
old plain toggle in the Formatting row and added the palette beside it, and the
end-to-end test failed with "resolved to 2 elements" — two buttons, both called
Highlight, doing different things. The test caught a real product problem rather
than a selector problem. The toggle is gone; yellow is the first swatch, so the
common case costs one extra click and the toolbar says one thing.

---

## 3. Font size

**An attribute on `textStyle`, not a mark of its own.**

TipTap ships no font-size extension, and that absence is informative. Size is
not a separate kind of formatting — it belongs on the same `textStyle` mark that
colour and font family already use. A second mark would let one span carry two
conflicting sizes, and would need its own parse and serialise rules on both
sides of the Markdown converter. As an attribute, a coloured, sized, Georgia run
is **one mark with three attributes** and the schema does not grow at all.

That is also why `editor-schema.json` needed no new mark name, and why the
backend parity tests passed without a converter change: `textStyle` was already
listed as lossy, and font size drops with it.

**Points, not pixels**, because that is the unit the control is borrowed from
and the one that means something on paper.

**The ladder is Word's** — 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72.
The gaps widen as the numbers grow because a point matters less at 48 than at 9;
a linear ladder would spend twelve clicks crossing the range nobody uses.

Three decisions in `nextFontSize` worth recording:

- **The ladder is entered at the document's own size**, not at its bottom rung.
  The overwhelmingly common case is a selection with no size set, and the first
  press of "grow" should go to 14, not to 9.
- **A size that is not on the ladder still moves in the direction asked.**
  Growing from an imported 13pt gives 14, shrinking gives 12. Snapping to the
  nearest rung first would make one of those two buttons visibly do nothing.
- **An off-ladder size is added to the dropdown.** Otherwise the box shows 12
  while the text is 13, which is a control that lies about what it is looking at.

---

## 4. Alignment

Justify was one entry in an array. The icons were also replaced: all four
buttons previously drew the same `≡` glyph with a `text-align` on it, so the
control said what it did only in its tooltip. Each now draws four bars in the
shape of the alignment it produces.

---

## 5. What this costs on export

Every addition here is formatting Markdown cannot carry, so the lossy warning
had to grow with it — the rule this project keeps is that formatting may be lost
on export, **never silently**.

| Added | On Markdown export |
|---|---|
| Font size | Dropped with the rest of `textStyle`; words survive |
| Highlight colour | **The `<mark>` survives; only which colour it was is lost** |

The highlight case is different in kind and gets its own test for that reason: a
yellow and a pink highlight come back identical. An assertion that merely
checked the text survived would have passed while the distinction quietly
disappeared.

PDF keeps all of it, because PDF is the browser rendering what is on screen.

---

## 6. Testing

| Layer | Coverage |
|---|---|
| Unit (pure) | The size ladder: entry point, both directions, off-ladder sizes, both ends, and that the ladder itself is sorted and unique |
| Unit (pure) | `parseFontSize` returns null rather than NaN for pixels, words, empty and negative input |
| Unit (component) | Palette sets a colour and *removes* rather than setting black; highlight passes a colour; size box shows the document's own size; grow and shrink step correctly; an off-ladder size appears in the list |
| Backend | A sized run keeps its words; a coloured highlight keeps its words **and its mark** |
| End to end | A colour survives a reload; a highlight carries an inline background; size changes rendered CSS; justify applies; the export dialog names the new losses |

---

## 7. Deliberately not built

- **The Clipboard group.** The browser already does Ctrl+C/X/V. A Paste *button*
  cannot read the clipboard without a permission prompt, so it would be a button
  that sometimes fails for no visible reason.
- **A full colour picker.** See §2.
- Line spacing, indent/outdent, format painter, show-formatting-marks,
  paragraph shading, multilevel lists, borders, sort. All reasonable; all need
  custom extensions of their own; none as conspicuous as a missing font size.

---

## 8. Definition of done

- [x] A swatch palette for text colour and for highlight
- [x] Font size with a list and grow/shrink, stored on `textStyle`
- [x] Justify, and alignment icons that show their shape
- [x] One Highlight control, not two
- [x] The export warning names size and highlight colour
- [x] Backend, Vitest and Playwright pass
