import { describe, expect, it } from "vitest";

import { SYMBOL_GROUPS, searchSymbols } from "./symbols";
import { DATE_FORMATS, formatOptions } from "./dateTime";

describe("SYMBOL_GROUPS", () => {
  it("holds no duplicate characters", () => {
    // Two entries for the same character would give the picker two identical
    // buttons and make React keys collide.
    const chars = SYMBOL_GROUPS.flatMap((group) => group.symbols.map((s) => s.char));

    expect(new Set(chars).size).toBe(chars.length);
  });

  it("gives every symbol a name to be found by", () => {
    for (const group of SYMBOL_GROUPS) {
      for (const symbol of group.symbols) {
        expect(symbol.name.trim()).not.toBe("");
      }
    }
  });

  it("holds single characters, not sequences", () => {
    // A picker entry that inserts two characters is a snippet wearing a
    // symbol's clothes, and would break the "this costs the schema nothing"
    // claim the moment one of them was a newline.
    for (const group of SYMBOL_GROUPS) {
      for (const symbol of group.symbols) {
        expect([...symbol.char]).toHaveLength(1);
      }
    }
  });
});

describe("searchSymbols", () => {
  it("finds by name", () => {
    expect(searchSymbols("infinity").map((s) => s.char)).toEqual(["∞"]);
  });

  it("finds by how someone would actually type it", () => {
    // The keywords earn their place here: nobody searches "multiplication".
    expect(searchSymbols("x").map((s) => s.char)).toContain("×");
    expect(searchSymbols("->").map((s) => s.char)).toContain("→");
    expect(searchSymbols("!=").map((s) => s.char)).toContain("≠");
    expect(searchSymbols("tm").map((s) => s.char)).toContain("™");
  });

  it("finds a symbol by the symbol", () => {
    // "What is this and can I have another one" — pasting the character in.
    expect(searchSymbols("±").map((s) => s.char)).toEqual(["±"]);
  });

  it("ignores case and surrounding space", () => {
    expect(searchSymbols("  EURO ").map((s) => s.char)).toEqual(["€"]);
  });

  it("returns nothing for an empty query rather than everything", () => {
    // The caller shows the browsable groups in that case. Returning the flat
    // list would silently replace them with a wall of characters.
    expect(searchSymbols("")).toEqual([]);
    expect(searchSymbols("   ")).toEqual([]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchSymbols("qwertyuiop")).toEqual([]);
  });
});

describe("formatOptions", () => {
  const midday = new Date(2026, 7, 30, 13, 45);

  it("offers every format, each with text", () => {
    const options = formatOptions(midday, "en-GB");

    expect(options).toHaveLength(DATE_FORMATS.length);
    for (const option of options) {
      expect(option.text.trim()).not.toBe("");
    }
  });

  it("has stable ids that do not change with the date", () => {
    // React keys and tests hang off these; the formatted text changes daily by
    // design, so it cannot be the identity.
    const today = formatOptions(new Date(2026, 0, 1), "en-GB").map((o) => o.id);
    const later = formatOptions(new Date(2027, 5, 15), "en-GB").map((o) => o.id);

    expect(today).toEqual(later);
  });

  it("writes ISO 8601 the same way regardless of locale", () => {
    // The one format that is deliberately not the reader's own: it sorts as a
    // string and means the same thing everywhere.
    const gb = formatOptions(midday, "en-GB").find((o) => o.id === "iso");
    const us = formatOptions(midday, "en-US").find((o) => o.id === "iso");

    expect(gb?.text).toBe("2026-08-30");
    expect(us?.text).toBe("2026-08-30");
  });

  it("pads the ISO month and day", () => {
    const [option] = formatOptions(new Date(2026, 0, 5), "en-GB").filter(
      (o) => o.id === "iso",
    );

    expect(option.text).toBe("2026-01-05");
  });

  it("follows the locale for the other formats", () => {
    // Proves they are localised at all — a hardcoded English format would pass
    // every other assertion here.
    const gb = formatOptions(midday, "en-GB").find((o) => o.id === "short-date");
    const us = formatOptions(midday, "en-US").find((o) => o.id === "short-date");

    expect(gb?.text).not.toBe(us?.text);
  });

  it("cannot straddle midnight", () => {
    // Every entry comes from one Date. Formatting each from its own new Date()
    // could show two different days in the same menu.
    const lastMoment = new Date(2026, 7, 30, 23, 59, 59, 999);
    const options = formatOptions(lastMoment, "en-GB");

    expect(options.find((o) => o.id === "iso")?.text).toBe("2026-08-30");
    expect(options.find((o) => o.id === "long-date")?.text).toContain("2026");
  });
});
