import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import {
  WORDS_PER_MINUTE,
  changeCase,
  countWords,
  outlineOf,
  statisticsOf,
  toTitleCase,
} from "./document";
import { baseExtensions } from "./extensions";
import { findInDocument, findMatches } from "./findReplace";

const schema = getSchema(baseExtensions({ withHistory: true }));

function docOf(...blocks: ({ heading: number; text: string } | string)[]): PMNode {
  return schema.nodeFromJSON({
    type: "doc",
    content: blocks.map((block) =>
      typeof block === "string"
        ? { type: "paragraph", content: block ? [{ type: "text", text: block }] : [] }
        : {
            type: "heading",
            attrs: { level: block.heading },
            content: block.text ? [{ type: "text", text: block.text }] : [],
          },
    ),
  });
}

describe("findMatches", () => {
  it("finds every occurrence", () => {
    expect(findMatches("one two one two one", { needle: "one", matchCase: true })).toEqual([
      { from: 0, to: 3 },
      { from: 8, to: 11 },
      { from: 16, to: 19 },
    ]);
  });

  it("ignores case unless asked", () => {
    const text = "The the THE";

    expect(findMatches(text, { needle: "the", matchCase: false })).toHaveLength(3);
    expect(findMatches(text, { needle: "the", matchCase: true })).toEqual([{ from: 4, to: 7 }]);
  });

  it("finds nothing for an empty needle rather than everything", () => {
    // An empty search matching at every position would paint the whole document
    // and report a match count equal to its length.
    expect(findMatches("anything", { needle: "", matchCase: false })).toEqual([]);
  });

  it("does not report overlapping matches", () => {
    // "aa" in "aaa" is one match, not two: the second would share characters
    // with the first, and Replace All over overlaps has no sane meaning.
    expect(findMatches("aaa", { needle: "aa", matchCase: true })).toEqual([{ from: 0, to: 2 }]);
  });

  it("treats the needle literally, not as a pattern", () => {
    // A find bar that accepts regex turns a stray bracket into an error the
    // user did not ask to debug.
    expect(findMatches("cost (approx) 5", { needle: "(approx)", matchCase: true })).toEqual([
      { from: 5, to: 13 },
    ]);
    expect(findMatches("a.b", { needle: ".", matchCase: true })).toEqual([{ from: 1, to: 2 }]);
  });

  it("returns nothing when the word is absent", () => {
    expect(findMatches("one two", { needle: "three", matchCase: false })).toEqual([]);
  });
});

describe("findInDocument", () => {
  it("maps a match to positions the editor can act on", () => {
    const doc = docOf("The quick brown fox");

    const [match] = findInDocument(doc, { needle: "brown", matchCase: false });

    expect(doc.textBetween(match.from, match.to)).toBe("brown");
  });

  it("finds matches across separate blocks", () => {
    const doc = docOf("first target here", "second target here");

    const matches = findInDocument(doc, { needle: "target", matchCase: false });

    expect(matches).toHaveLength(2);
    for (const match of matches) {
      expect(doc.textBetween(match.from, match.to)).toBe("target");
    }
  });

  it("does not match across a block boundary", () => {
    // "one" and "two" in separate paragraphs are not the string "onetwo", and
    // a match spanning the join would map to a range covering both blocks.
    const doc = docOf("one", "two");

    expect(findInDocument(doc, { needle: "onetwo", matchCase: false })).toEqual([]);
  });
});

describe("outlineOf", () => {
  it("lists headings with their level, in document order", () => {
    const doc = docOf(
      { heading: 1, text: "Introduction" },
      "Some prose.",
      { heading: 2, text: "Background" },
      { heading: 3, text: "Earlier work" },
    );

    expect(outlineOf(doc).map((h) => [h.level, h.text])).toEqual([
      [1, "Introduction"],
      [2, "Background"],
      [3, "Earlier work"],
    ]);
  });

  it("is empty for a document with no headings", () => {
    // The panel hides itself on this, rather than promising a structure the
    // document has not got.
    expect(outlineOf(docOf("Just prose.", "And more."))).toEqual([]);
  });

  it("names an empty heading rather than leaving an unclickable blank", () => {
    expect(outlineOf(docOf({ heading: 2, text: "" }))[0].text).toBe("Untitled heading");
  });

  it("gives a position that lands on the heading", () => {
    const doc = docOf("Some prose.", { heading: 2, text: "Findable" });

    const [heading] = outlineOf(doc);

    expect(doc.nodeAt(heading.pos)?.textContent).toBe("Findable");
  });
});

describe("countWords", () => {
  it("counts words split by any whitespace", () => {
    expect(countWords("one two  three\nfour\tfive")).toBe(5);
  });

  it("counts nothing in an empty or blank string", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });

  it("counts a hyphenated word once", () => {
    expect(countWords("well-known example")).toBe(2);
  });
});

describe("statisticsOf", () => {
  it("counts the whole document by default", () => {
    const stats = statisticsOf(docOf("one two three", "four five"));

    expect(stats.words).toBe(5);
    expect(stats.characters).toBe("one two three\nfour five".length);
  });

  it("counts a selection when there is one", () => {
    // What Word does, and what people expect: select a paragraph and the count
    // becomes that paragraph's.
    const doc = docOf("one two three four five");

    expect(statisticsOf(doc, { from: 1, to: 8 }).words).toBe(2);
  });

  it("falls back to the document for an empty selection", () => {
    const doc = docOf("one two three");

    expect(statisticsOf(doc, { from: 4, to: 4 }).words).toBe(3);
  });

  it("never reports a reading time of zero minutes for real text", () => {
    // "0 min read" is not a thing anyone wants to be told.
    expect(statisticsOf(docOf("one")).minutes).toBe(1);
  });

  it("reports nothing to read for an empty document", () => {
    expect(statisticsOf(docOf("")).minutes).toBe(0);
    expect(statisticsOf(docOf("")).words).toBe(0);
  });

  it("rounds reading time up to the next whole minute", () => {
    const words = Array.from({ length: WORDS_PER_MINUTE + 1 }, () => "word").join(" ");

    expect(statisticsOf(docOf(words)).minutes).toBe(2);
  });
});

describe("toTitleCase", () => {
  it("leaves the small words alone in the middle", () => {
    // The naive version produces "The Rise And Fall Of The Roman Empire", which
    // looks wrong to everybody and right to nobody.
    expect(toTitleCase("the rise and fall of the roman empire")).toBe(
      "The Rise and Fall of the Roman Empire",
    );
  });

  it("capitalises a small word when it is first or last", () => {
    expect(toTitleCase("to be or not to be")).toBe("To Be or Not to Be");
    expect(toTitleCase("something to look at")).toBe("Something to Look At");
  });

  it("normalises words that were already shouting", () => {
    expect(toTitleCase("THE QUICK BROWN FOX")).toBe("The Quick Brown Fox");
  });

  it("keeps the original spacing", () => {
    expect(toTitleCase("one  two")).toBe("One  Two");
  });

  it("handles a single word", () => {
    expect(toTitleCase("the")).toBe("The");
  });
});

describe("changeCase", () => {
  it("does the three cases", () => {
    expect(changeCase("Mixed Case Text", "upper")).toBe("MIXED CASE TEXT");
    expect(changeCase("Mixed Case Text", "lower")).toBe("mixed case text");
    expect(changeCase("mixed case text", "title")).toBe("Mixed Case Text");
  });
});
