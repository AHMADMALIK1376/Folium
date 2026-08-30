import { describe, expect, it } from "vitest";

import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  nextFontSize,
  parseFontSize,
} from "./fontSize";

describe("parseFontSize", () => {
  it("reads back what the extension writes", () => {
    expect(parseFontSize("14pt")).toBe(14);
    expect(parseFontSize("  9pt ")).toBe(9);
    expect(parseFontSize("11.5pt")).toBe(11.5);
  });

  it("returns null rather than NaN for anything it cannot read", () => {
    // A document that came through an import, or from a version of this that
    // wrote pixels. Rendering "NaNpt" would give the paragraph no size at all.
    expect(parseFontSize("16px")).toBeNull();
    expect(parseFontSize("large")).toBeNull();
    expect(parseFontSize("")).toBeNull();
    expect(parseFontSize(null)).toBeNull();
    expect(parseFontSize(undefined)).toBeNull();
  });

  it("refuses a size that is zero or negative", () => {
    expect(parseFontSize("0pt")).toBeNull();
    expect(parseFontSize("-4pt")).toBeNull();
  });
});

describe("nextFontSize", () => {
  it("enters the ladder at the document's own size, not at the bottom", () => {
    // The common case by far: nothing is selected that has a size, and the
    // first press of grow should be one step up from what is on screen.
    expect(nextFontSize(null, 1)).toBe(14);
    expect(nextFontSize(null, -1)).toBe(11);
    expect(DEFAULT_FONT_SIZE).toBe(12);
  });

  it("steps up and down the ladder", () => {
    expect(nextFontSize("14pt", 1)).toBe(16);
    expect(nextFontSize("16pt", -1)).toBe(14);
    expect(nextFontSize(36, 1)).toBe(48);
  });

  it("moves in the direction asked from a size not on the ladder", () => {
    // Both directions have to do something. Snapping to the nearest rung first
    // would make one of them a button that visibly does nothing.
    expect(nextFontSize("13pt", 1)).toBe(14);
    expect(nextFontSize("13pt", -1)).toBe(12);
  });

  it("stops at the ends rather than running off them", () => {
    const smallest = FONT_SIZES[0];
    const largest = FONT_SIZES[FONT_SIZES.length - 1];

    expect(nextFontSize(`${smallest}pt`, -1)).toBe(smallest);
    expect(nextFontSize(`${largest}pt`, 1)).toBe(largest);
    // And from beyond either end, which an imported document can hold.
    expect(nextFontSize("4pt", -1)).toBe(smallest);
    expect(nextFontSize("200pt", 1)).toBe(largest);
  });

  it("has a ladder that only ever increases", () => {
    // Guards the constant itself: an out-of-order entry would make grow and
    // shrink disagree about which way is up.
    const sorted = [...FONT_SIZES].sort((a, b) => a - b);
    expect(FONT_SIZES).toEqual(sorted);
    expect(new Set(FONT_SIZES).size).toBe(FONT_SIZES.length);
  });
});
