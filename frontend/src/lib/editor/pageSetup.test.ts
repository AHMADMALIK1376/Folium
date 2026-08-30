import { describe, expect, it } from "vitest";

import {
  contentWidth,
  DEFAULT_PAGE_SETUP,
  MARGIN_PRESETS,
  MAX_MARGIN_IN,
  pageDimensions,
  pageSetupCss,
  parseMargin,
  presetNameFor,
  withDefaults,
  type PageSetup,
} from "./pageSetup";

const A4: PageSetup = DEFAULT_PAGE_SETUP;

describe("withDefaults", () => {
  it("treats null as never set up", () => {
    // The API returns null for a document that predates the feature, and that
    // has to mean "the application's default", not "no page at all".
    expect(withDefaults(null)).toEqual(A4);
    expect(withDefaults(undefined)).toEqual(A4);
  });

  it("fills in only what is missing", () => {
    const result = withDefaults({ size: "letter" });

    expect(result.size).toBe("letter");
    expect(result.orientation).toBe("portrait");
    expect(result.margins).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
  });

  it("fills in a partial set of margins", () => {
    const result = withDefaults({ margins: { left: 2 } as never });

    expect(result.margins).toEqual({ top: 1, right: 1, bottom: 1, left: 2 });
  });

  it("does not share the default margins object", () => {
    // A returned reference into DEFAULT_PAGE_SETUP would let one document's
    // edit change every other document's defaults for the session.
    const first = withDefaults(null);
    first.margins.top = 99;

    expect(withDefaults(null).margins.top).toBe(1);
  });
});

describe("pageDimensions", () => {
  it("gives the paper's own size in portrait", () => {
    expect(pageDimensions(A4)).toEqual({ width: 8.27, height: 11.69 });
  });

  it("swaps them in landscape", () => {
    expect(pageDimensions({ ...A4, orientation: "landscape" })).toEqual({
      width: 11.69,
      height: 8.27,
    });
  });

  it("knows Letter and Legal apart", () => {
    // They share a width and differ only in height, so a table keyed on width
    // alone would silently treat them as the same paper.
    const letter = pageDimensions({ ...A4, size: "letter" });
    const legal = pageDimensions({ ...A4, size: "legal" });

    expect(letter.width).toBe(legal.width);
    expect(letter.height).not.toBe(legal.height);
  });
});

describe("contentWidth", () => {
  it("is the page less its margins", () => {
    expect(contentWidth(A4)).toBeCloseTo(6.27, 5);
  });

  it("clamps rather than going to zero or negative", () => {
    // Two margins that are each legal can still leave nothing between them.
    // 2in a side is allowed, and on an 8.27in page that is 4.27in of text; 3in
    // a side is also allowed and leaves less than nothing.
    const squeezed = contentWidth({
      ...A4,
      margins: { top: 1, bottom: 1, left: MAX_MARGIN_IN, right: MAX_MARGIN_IN },
    });

    expect(squeezed).toBeGreaterThan(0);
  });
});

describe("presetNameFor", () => {
  it("names every preset it ships", () => {
    for (const preset of MARGIN_PRESETS) {
      expect(presetNameFor(preset.margins)).toBe(preset.name);
    }
  });

  it("returns null for margins that match nothing", () => {
    expect(presetNameFor({ top: 1.1, right: 1, bottom: 1, left: 1 })).toBeNull();
  });

  it("does not confuse Moderate with Office 2003", () => {
    // Both keep 1in top and bottom and differ only left and right, so a
    // comparison that checked two edges would call them the same.
    expect(presetNameFor({ top: 1, right: 0.75, bottom: 1, left: 0.75 })).toBe("Moderate");
    expect(presetNameFor({ top: 1, right: 1.25, bottom: 1, left: 1.25 })).toBe(
      "Office 2003 Default",
    );
  });
});

describe("parseMargin", () => {
  it("reads a number", () => {
    expect(parseMargin("1")).toBe(1);
    expect(parseMargin("0.75")).toBe(0.75);
    expect(parseMargin(" 2 ")).toBe(2);
  });

  it("returns null for a half-typed field rather than snapping to zero", () => {
    // Clearing the box would otherwise mean 0, and the page would jump to a
    // full-bleed layout between two keystrokes.
    expect(parseMargin("")).toBeNull();
    expect(parseMargin("  ")).toBeNull();
    expect(parseMargin(".")).toBeNull();
  });

  it("refuses what is not a number, and what is out of range", () => {
    expect(parseMargin("wide")).toBeNull();
    expect(parseMargin("-1")).toBeNull();
    expect(parseMargin("99")).toBeNull();
    expect(parseMargin("Infinity")).toBeNull();
  });

  it("accepts both ends of the allowed range", () => {
    expect(parseMargin("0")).toBe(0);
    expect(parseMargin(String(MAX_MARGIN_IN))).toBe(MAX_MARGIN_IN);
  });
});

describe("pageSetupCss", () => {
  it("sets the paper the print dialog will use", () => {
    // @page is the only thing the browser's print dialog obeys. Without it the
    // PDF comes out on whatever paper the printer defaults to, whatever the
    // document says.
    const css = pageSetupCss({ ...A4, size: "letter", orientation: "landscape" });

    expect(css).toContain("@page");
    expect(css).toContain("size: letter landscape");
  });

  it("uses the same margins on screen and on paper", () => {
    const css = pageSetupCss({
      ...A4,
      margins: { top: 0.5, right: 0.75, bottom: 1, left: 1.25 },
    });

    expect(css).toContain("margin: 0.5in 0.75in 1in 1.25in");
    expect(css).toContain("padding: 0.5in 0.75in 1in 1.25in");
  });

  it("drops the screen imitation when printing", () => {
    // @page has already applied the margins by then. A .folium-page still
    // carrying its own padding would apply them twice and print the document
    // inset by double.
    const css = pageSetupCss(A4);
    const printBlock = css.slice(css.indexOf("@media print"));

    expect(printBlock).toContain("padding: 0");
    expect(printBlock).toContain("width: auto");
  });

  it("gives an empty document a full page to sit on", () => {
    // A minimum rather than a height: an empty document should look like a
    // sheet of paper, and a long one still has to grow.
    expect(pageSetupCss(A4)).toContain("min-height: 11.69in");
  });

  it("drops the minimum height when printing", () => {
    // @page owns the sheet on paper. A minimum height surviving into print
    // would force a blank second page out of a document that ended halfway
    // down the first.
    const css = pageSetupCss(A4);
    const printBlock = css.slice(css.indexOf("@media print"));

    expect(printBlock).toContain("min-height: 0");
  });

  it("gives the sheet the page's own width on screen", () => {
    expect(pageSetupCss(A4)).toContain("width: 8.27in");
  });
});
