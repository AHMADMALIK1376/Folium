import { describe, expect, it } from "vitest";

import { lossyFormattingIn, lossyWarning } from "./lossy";

function paragraph(attrs: Record<string, unknown>, marks: unknown[] = []) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs,
        content: [{ type: "text", text: "words", marks }],
      },
    ],
  };
}

describe("lossyFormattingIn", () => {
  it("finds nothing in a plain document", () => {
    expect(lossyFormattingIn(paragraph({ textAlign: null }))).toEqual([]);
  });

  it("ignores marks Markdown can carry", () => {
    const doc = paragraph({ textAlign: null }, [{ type: "bold" }, { type: "highlight" }]);

    expect(lossyFormattingIn(doc)).toEqual([]);
  });

  it("finds colour, fonts and alignment", () => {
    expect(lossyFormattingIn(paragraph({ textAlign: "center" }))).toEqual(["alignment"]);
    expect(
      lossyFormattingIn(
        paragraph({ textAlign: null }, [
          { type: "textStyle", attrs: { color: "#b01a20" } },
        ]),
      ),
    ).toEqual(["colour"]);
    expect(
      lossyFormattingIn(
        paragraph({ textAlign: null }, [
          { type: "textStyle", attrs: { fontFamily: "Georgia, serif" } },
        ]),
      ),
    ).toEqual(["fonts"]);
  });

  it("does not report a textStyle mark carrying nothing", () => {
    // TipTap leaves an empty textStyle behind when a colour is unset. Warning
    // about formatting that is not there would train people to ignore it.
    const doc = paragraph({ textAlign: null }, [{ type: "textStyle", attrs: {} }]);

    expect(lossyFormattingIn(doc)).toEqual([]);
  });

  it("looks inside nested content, not just the top level", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              attrs: { textAlign: "right" },
              content: [{ type: "text", text: "quoted" }],
            },
          ],
        },
      ],
    };

    expect(lossyFormattingIn(doc)).toEqual(["alignment"]);
  });

  it("reports a stable order regardless of what appears first", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            { type: "text", text: "a", marks: [{ type: "textStyle", attrs: { color: "#000" } }] },
          ],
        },
      ],
    };

    expect(lossyFormattingIn(doc)).toEqual(["colour", "alignment"]);
  });

  it("survives malformed input rather than throwing", () => {
    expect(lossyFormattingIn(null)).toEqual([]);
    expect(lossyFormattingIn(undefined)).toEqual([]);
    expect(lossyFormattingIn({ content: "not a list" })).toEqual([]);
  });
});

describe("lossyWarning", () => {
  it("says nothing when there is nothing to lose", () => {
    expect(lossyWarning(paragraph({ textAlign: null }))).toBeNull();
  });

  it("names what will be dropped and where it survives", () => {
    const warning = lossyWarning(paragraph({ textAlign: "center" }));

    expect(warning).toContain("alignment");
    // The useful half: what to do about it.
    expect(warning).toMatch(/PDF/);
  });

  it("reads as a sentence with several kinds", () => {
    const doc = paragraph({ textAlign: "center" }, [
      { type: "textStyle", attrs: { color: "#000", fontFamily: "Georgia" } },
    ]);

    expect(lossyWarning(doc)).toContain("colour, fonts and alignment");
  });
});
