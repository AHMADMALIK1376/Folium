/** How a document sits on paper.
 *
 * The honest limit first, because it shapes everything here: **a browser does
 * not paginate.** Word knows where page 2 begins because it lays text into
 * fixed-height boxes; a `contenteditable` is one continuous scroll. So this
 * gives a document a real page *width* and real margins, on screen and on
 * paper, and it does not give it page breaks you can see, repeating headers, or
 * "page 3 of 12". Those need a layout engine, not a stylesheet.
 *
 * What it does give is the thing that actually matters day to day: what you see
 * is the width you will print, so a line that fits on screen fits on the page.
 */

export type PageSize = "a4" | "letter" | "legal";
export type Orientation = "portrait" | "landscape";

export type Margins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PageSetup = {
  size: PageSize;
  orientation: Orientation;
  margins: Margins;
};

/** Page dimensions in inches, portrait.
 *
 * Inches throughout, because Word's presets are stated in inches and this
 * exists to match them: 0.75in is exact where 19.05mm is a rounding artefact of
 * it. CSS understands `in` natively, so the number stored is the number
 * rendered — no conversion sits between the setting and the page.
 */
export const PAGE_DIMENSIONS: Record<PageSize, { width: number; height: number }> = {
  a4: { width: 8.27, height: 11.69 },
  letter: { width: 8.5, height: 11 },
  legal: { width: 8.5, height: 14 },
};

export const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  a4: "A4",
  letter: "Letter",
  legal: "Legal",
};

/** Word's margin presets, with its own numbers.
 *
 * **Mirrored is deliberately absent.** It sets an Inside and an Outside margin
 * rather than a Left and a Right, which only means something once you know
 * whether a page is odd or even — and without pagination there are no page
 * numbers to be odd or even. Offering it would draw a document that looks
 * identical to Normal and claim to be doing something.
 */
export const MARGIN_PRESETS: { name: string; margins: Margins }[] = [
  { name: "Normal", margins: { top: 1, right: 1, bottom: 1, left: 1 } },
  { name: "Narrow", margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } },
  { name: "Moderate", margins: { top: 1, right: 0.75, bottom: 1, left: 0.75 } },
  { name: "Wide", margins: { top: 1, right: 2, bottom: 1, left: 2 } },
  { name: "Office 2003 Default", margins: { top: 1, right: 1.25, bottom: 1, left: 1.25 } },
];

export const DEFAULT_PAGE_SETUP: PageSetup = {
  size: "a4",
  orientation: "portrait",
  margins: { ...MARGIN_PRESETS[0].margins },
};

/** The same bounds the backend enforces. Stated here too so the control can
 *  refuse a value before a round trip, not so the backend can trust it. */
export const MIN_MARGIN_IN = 0;
export const MAX_MARGIN_IN = 3;

/** What the document says, or the defaults when it has never been set up.
 *
 * `null` from the API is meaningful: it means nobody has chosen, so the
 * application's default applies and keeps applying if that default changes.
 * Everything downstream wants a complete setup, so the widening happens once,
 * here.
 */
export function withDefaults(setup: Partial<PageSetup> | null | undefined): PageSetup {
  return {
    size: setup?.size ?? DEFAULT_PAGE_SETUP.size,
    orientation: setup?.orientation ?? DEFAULT_PAGE_SETUP.orientation,
    margins: { ...DEFAULT_PAGE_SETUP.margins, ...(setup?.margins ?? {}) },
  };
}

/** The page's dimensions as laid out, landscape included. */
export function pageDimensions(setup: PageSetup): { width: number; height: number } {
  const { width, height } = PAGE_DIMENSIONS[setup.size];
  return setup.orientation === "landscape"
    ? { width: height, height: width }
    : { width, height };
}

/** The width left for text once the margins are taken out.
 *
 * Can go to zero or below, and is clamped rather than refused: margins are
 * bounded individually by the schema, but 2in either side of an 8.27in page is
 * two legal values that together leave nothing. Clamping keeps the editor
 * usable while the person is still dragging the numbers around; the alternative
 * is a page that vanishes mid-edit.
 */
export function contentWidth(setup: PageSetup): number {
  const { width } = pageDimensions(setup);
  return Math.max(1, width - setup.margins.left - setup.margins.right);
}

/** The name of the preset these margins match, or null for a custom set. */
export function presetNameFor(margins: Margins): string | null {
  const match = MARGIN_PRESETS.find(
    (preset) =>
      preset.margins.top === margins.top &&
      preset.margins.right === margins.right &&
      preset.margins.bottom === margins.bottom &&
      preset.margins.left === margins.left,
  );
  return match?.name ?? null;
}

/** Read a typed margin, refusing what cannot be one.
 *
 * Returns null rather than a fallback so the caller can leave a half-typed
 * field alone. Coercing "" to 0 as the user clears the box would snap the page
 * to a full-bleed layout between two keystrokes.
 */
export function parseMargin(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < MIN_MARGIN_IN || parsed > MAX_MARGIN_IN) return null;

  return parsed;
}

/** The CSS that makes the screen and the printed page agree.
 *
 * Two rules, and both are needed. `@page` is what the browser's print dialog
 * obeys — it is the only way to set the paper size and the printed margins, and
 * nothing else on the page can influence them. The `.folium-page` block is the
 * screen's imitation of that same sheet.
 *
 * On paper the screen imitation has to get out of the way: `@page` has already
 * applied the margins, so a `.folium-page` still carrying its own padding would
 * apply them twice and print a document inset by two inches.
 *
 * Emitted as a string and injected per document, because these values differ
 * from one document to the next and a stylesheet cannot be parameterised.
 */
export function pageSetupCss(setup: PageSetup): string {
  const { width, height } = pageDimensions(setup);
  const { top, right, bottom, left } = setup.margins;

  return `
@page {
  size: ${setup.size} ${setup.orientation};
  margin: ${top}in ${right}in ${bottom}in ${left}in;
}

.folium-page {
  width: ${width}in;
  /* A minimum, not a height. An empty document should look like a sheet of
     paper rather than a strip of one -- but a long document has to keep
     growing, because nothing here can decide where a second page would begin. */
  min-height: ${height}in;
  padding: ${top}in ${right}in ${bottom}in ${left}in;
}

@media print {
  .folium-page {
    width: auto;
    /* Dropped along with the padding: @page owns the sheet on paper, and a
       minimum height here would force a blank second page out of a document
       that ended halfway down the first. */
    min-height: 0;
    padding: 0;
    box-shadow: none;
    margin: 0;
  }
}`.trim();
}
