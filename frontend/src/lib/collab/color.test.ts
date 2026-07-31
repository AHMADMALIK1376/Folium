import { describe, expect, it } from "vitest";

import { CURSOR_COLORS, cursorColor } from "./color";

describe("cursorColor", () => {
  it("gives the same person the same colour every time", () => {
    // A colour chosen per session makes two people's cursors swap on refresh,
    // which reads as a bug in the collaboration rather than in the palette.
    const id = "8f14e45f-ea0f-4b31-9b7a-000000000001";
    expect(cursorColor(id)).toBe(cursorColor(id));
  });

  it("only ever returns a colour from the palette", () => {
    for (let i = 0; i < 50; i++) {
      expect(CURSOR_COLORS).toContain(cursorColor(`user-${i}`));
    }
  });

  it("spreads people across the palette rather than favouring one", () => {
    const used = new Set(
      Array.from({ length: 60 }, (_, i) => cursorColor(`user-${i}`)),
    );
    // Not a guarantee for any two specific ids — a hash may collide — but a
    // function that returned one colour for everyone would fail here.
    expect(used.size).toBeGreaterThan(1);
  });

  it("never returns the brand carmine", () => {
    // Carmine is the app's own accent. A cursor in it reads as interface rather
    // than as another person.
    const brand = ["#d41f26", "#b01a20", "#8c1419"];
    for (const color of CURSOR_COLORS) {
      expect(brand).not.toContain(color.toLowerCase());
    }
  });

  it("handles an empty id without throwing", () => {
    expect(CURSOR_COLORS).toContain(cursorColor(""));
  });
});
