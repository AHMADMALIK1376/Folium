import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import {
  CONTEXT_LENGTH,
  describeSelection,
  documentText,
  findQuote,
  locate,
} from "./anchors";
import { baseExtensions } from "./extensions";

/** The real editor schema, so these exercise the document shape the app
 *  actually produces rather than a hand-built approximation. */
const schema = getSchema(baseExtensions({ withHistory: true }));

function docOf(...paragraphs: string[]): PMNode {
  return schema.nodeFromJSON({
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    })),
  });
}

describe("findQuote", () => {
  it("finds the only occurrence", () => {
    expect(findQuote("the quick brown fox", { quote: "brown", prefix: null, suffix: null })).toEqual(
      { start: 10, end: 15 },
    );
  });

  it("returns null when the passage is gone", () => {
    // Not a failure: the comment is still shown, marked detached. Losing a
    // highlight is recoverable; pointing at the wrong paragraph is not.
    expect(findQuote("rewritten entirely", { quote: "brown", prefix: null, suffix: null })).toBeNull();
  });

  it("uses the surrounding context to tell repeats apart", () => {
    const text = "we agree here. we agree there. we agree everywhere.";

    expect(findQuote(text, { quote: "we agree", prefix: null, suffix: " there" })).toEqual({
      start: 15,
      end: 23,
    });
    expect(findQuote(text, { quote: "we agree", prefix: null, suffix: " everywhere" })).toEqual({
      start: 31,
      end: 39,
    });
  });

  it("keeps its place when the context around it has been edited", () => {
    // Context is a tie-breaker, never a requirement. An anchor that needed its
    // context intact would detach every time a neighbouring word changed.
    const found = findQuote("a completely different sentence, then the passage", {
      quote: "the passage",
      prefix: "what came before ",
      suffix: " and after",
    });

    expect(found).toEqual({ start: 38, end: 49 });
  });

  it("prefers the earliest occurrence when nothing distinguishes them", () => {
    // Arbitrary, and better than being arbitrary differently on each render.
    expect(findQuote("same same", { quote: "same", prefix: null, suffix: null })).toEqual({
      start: 0,
      end: 4,
    });
  });

  it("refuses an empty quote rather than matching everywhere", () => {
    expect(findQuote("anything", { quote: "", prefix: null, suffix: null })).toBeNull();
  });
});

describe("documentText", () => {
  it("gives every character a position", () => {
    const { text, positions } = documentText(docOf("Hello"));

    expect(text).toBe("Hello");
    expect(positions).toHaveLength(5);
    expect(positions.every((p) => p >= 0)).toBe(true);
  });

  it("separates blocks, and gives the separator no position", () => {
    // A separator is not a character in the document, so nothing can be
    // anchored to it.
    const { text, positions } = documentText(docOf("One", "Two"));

    expect(text).toBe("One\nTwo");
    expect(positions[3]).toBe(-1);
  });

  it("survives an empty paragraph without inventing a character", () => {
    expect(documentText(docOf("One", "", "Two")).text).toBe("One\nTwo");
  });
});

describe("locate", () => {
  it("maps a quote back to a range the editor can decorate", () => {
    const doc = docOf("The quick brown fox");

    const range = locate(doc, { quote: "brown", prefix: null, suffix: null });

    expect(range).not.toBeNull();
    expect(doc.textBetween(range!.from, range!.to)).toBe("brown");
  });

  it("still finds the passage after text is inserted above it", () => {
    // The whole reason the anchor is a quote and not an offset.
    const range = locate(docOf("A new first paragraph", "The quick brown fox"), {
      quote: "brown fox",
      prefix: "The quick ",
      suffix: null,
    });

    expect(range).not.toBeNull();
    expect(docOf("A new first paragraph", "The quick brown fox").textBetween(
      range!.from,
      range!.to,
    )).toBe("brown fox");
  });

  it("returns null when the passage was deleted", () => {
    expect(locate(docOf("Something else now"), { quote: "brown", prefix: null, suffix: null })).toBeNull();
  });
});

describe("describeSelection", () => {
  it("records the passage and what surrounds it", () => {
    const doc = docOf("The quick brown fox jumps");
    // "brown" occupies positions 11..15 — text starts at 1 inside the paragraph.
    const anchor = describeSelection(doc, 11, 16);

    expect(anchor).toEqual({
      quote: "brown",
      prefix: "The quick ",
      suffix: " fox jumps",
    });
  });

  it("round-trips: what it describes, locate finds", () => {
    const doc = docOf("First paragraph here", "Second paragraph here");
    const anchor = describeSelection(doc, 24, 33);

    const range = locate(doc, anchor!);

    expect(doc.textBetween(range!.from, range!.to)).toBe(anchor!.quote);
  });

  it("bounds the context it keeps", () => {
    const long = "x".repeat(200);
    const doc = docOf(`${long}QUOTE${long}`);

    const anchor = describeSelection(doc, 1 + 200, 1 + 205);

    expect(anchor!.quote).toBe("QUOTE");
    expect(anchor!.prefix).toHaveLength(CONTEXT_LENGTH);
    expect(anchor!.suffix).toHaveLength(CONTEXT_LENGTH);
  });

  it("returns null for a selection that contains no text", () => {
    expect(describeSelection(docOf(""), 0, 1)).toBeNull();
  });
});
