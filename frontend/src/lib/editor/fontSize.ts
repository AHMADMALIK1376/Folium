import { Extension } from "@tiptap/core";

/** The sizes offered, in points.
 *
 * Word's ladder, which is not an arbitrary choice: the gaps widen as the
 * numbers grow because a point matters less at 48 than at 9. A linear ladder
 * would spend twelve clicks crossing the range nobody uses.
 *
 * Points rather than pixels because this is the unit the control is borrowed
 * from and the one that means something on paper — and print is where a size
 * chosen here actually has to hold.
 */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

/** What text is when nobody has chosen a size. Matches the editor's own body. */
export const DEFAULT_FONT_SIZE = 12;

/** Read a stored size back to a number, or null if there isn't one.
 *
 * Stored values are what `renderHTML` wrote — "14pt" — but a document that
 * arrived through an import or an older version may hold anything, so this
 * refuses what it cannot read rather than producing NaN and rendering a
 * paragraph at no size at all.
 */
export function parseFontSize(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)pt$/.exec(value.trim());
  if (!match) return null;

  const size = Number(match[1]);
  return Number.isFinite(size) && size > 0 ? size : null;
}

/** The next size up or down the ladder from `current`.
 *
 * `current` is what the selection has, which is very often nothing — so the
 * ladder is entered at the default rather than at its bottom rung, and the
 * first press of "grow" goes to 14 rather than to 9.
 *
 * A size that is not on the ladder still moves in the direction asked: growing
 * from an imported 13pt gives 14, shrinking gives 12. Snapping to the nearest
 * rung first would make one of those two directions do nothing, which reads as
 * a broken button.
 *
 * At either end it returns the end. A disabled button would be more honest and
 * also more fiddly for the person holding the key down, who simply stops
 * getting bigger.
 */
export function nextFontSize(
  current: string | number | null | undefined,
  direction: 1 | -1,
): number {
  const size =
    typeof current === "number" ? current : (parseFontSize(current) ?? DEFAULT_FONT_SIZE);

  if (direction === 1) {
    return FONT_SIZES.find((candidate) => candidate > size) ?? FONT_SIZES[FONT_SIZES.length - 1];
  }

  const smaller = FONT_SIZES.filter((candidate) => candidate < size);
  return smaller.length > 0 ? smaller[smaller.length - 1] : FONT_SIZES[0];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      /** Set the selection's size, in points. */
      setFontSize: (size: number) => ReturnType;
      /** Return the selection to the document's own size. */
      unsetFontSize: () => ReturnType;
    };
  }
}

/** Font size, as an attribute on TextStyle.
 *
 * TipTap ships no font-size extension, and the reason is worth knowing before
 * reaching for a third-party one: size is not a mark of its own, it is another
 * attribute on the `textStyle` mark that colour and font family already use.
 * Adding a second mark would let a span carry two conflicting sizes and would
 * need its own parse and serialise rules on both sides of the Markdown
 * converter. This adds an attribute instead, so a coloured, sized, Georgia run
 * is one mark with three attributes and the schema does not grow.
 */
export const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              const size = attributes.fontSize as string | null;
              return size ? { style: `font-size: ${size}` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size: number) =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontSize: `${size}pt` })
            .run(),

      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontSize: null })
            // Without this a span with no attributes left is kept, which
            // survives a save and comes back as an empty <span> around the
            // text forever.
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
