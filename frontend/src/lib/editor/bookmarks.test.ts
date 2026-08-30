import { describe, expect, it } from "vitest";

import { isValidBookmarkName, slugifyBookmark } from "./bookmarks";

describe("slugifyBookmark", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugifyBookmark("Methods and Materials")).toBe("methods-and-materials");
  });

  it("strips what an id and a URL fragment cannot both carry", () => {
    // The name ends up in an `id` attribute and in a `#fragment`. Restricting
    // it once, here, is why nothing downstream has to escape it.
    expect(slugifyBookmark("Section 3.1 — Results!")).toBe("section-3-1-results");
    expect(slugifyBookmark("a/b?c#d")).toBe("a-b-c-d");
  });

  it("does not leave hyphens hanging off either end", () => {
    expect(slugifyBookmark("  spaced  ")).toBe("spaced");
    expect(slugifyBookmark("!!!leading")).toBe("leading");
    expect(slugifyBookmark("trailing???")).toBe("trailing");
  });

  it("collapses runs of separators rather than repeating hyphens", () => {
    expect(slugifyBookmark("one   ---   two")).toBe("one-two");
  });

  it("bounds the length", () => {
    expect(slugifyBookmark("a".repeat(200))).toHaveLength(64);
  });

  it("does not end on a hyphen after being truncated", () => {
    // 64 characters could land mid-separator and leave a trailing hyphen, which
    // every other case here is careful to avoid.
    const slug = slugifyBookmark(`${"a".repeat(63)}   tail`);

    expect(slug).not.toMatch(/-$/);
  });
});

describe("isValidBookmarkName", () => {
  it("accepts anything that survives slugifying", () => {
    expect(isValidBookmarkName("Results")).toBe(true);
    expect(isValidBookmarkName("3")).toBe(true);
  });

  it("refuses a name that would slugify to nothing", () => {
    // Otherwise "!!!" becomes a bookmark called "" that nothing can link to,
    // and the failure is invisible until someone tries to reference it.
    expect(isValidBookmarkName("!!!")).toBe(false);
    expect(isValidBookmarkName("   ")).toBe(false);
    expect(isValidBookmarkName("")).toBe(false);
  });
});
