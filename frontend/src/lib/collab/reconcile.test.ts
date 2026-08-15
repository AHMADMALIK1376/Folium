import { describe, expect, it } from "vitest";

import { decideOnSync } from "./reconcile";
import type { TipTapDoc } from "@/lib/api/types";

const empty: TipTapDoc = { type: "doc", content: [] };
const blank: TipTapDoc = { type: "doc", content: [{ type: "paragraph" }] };

function doc(text: string): TipTapDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("decideOnSync", () => {
  it("seeds a room that has never held the document", () => {
    expect(decideOnSync(true, empty, doc("stored"))).toBe("seed");
  });

  it("saves when the room is ahead of the database", () => {
    // The case this exists for: everyone closed their laptop before autosave
    // fired, so the merged text lives only in the room. The next person to open
    // the document repairs the record.
    expect(decideOnSync(false, doc("newer"), doc("older"))).toBe("save");
  });

  it("does nothing when the two agree", () => {
    expect(decideOnSync(false, doc("same"), doc("same"))).toBe("none");
  });

  it("does nothing for a genuinely new document", () => {
    expect(decideOnSync(true, empty, empty)).toBe("none");
    expect(decideOnSync(true, empty, blank)).toBe("none");
  });

  it("ignores key order, so opening a document does not write for nothing", () => {
    // JSON.stringify comparison would call these different and produce a write
    // on every open, every time, for every reader.
    const a = { type: "doc", content: [{ type: "paragraph", attrs: { x: 1 } }] } as TipTapDoc;
    const b = { content: [{ attrs: { x: 1 }, type: "paragraph" }], type: "doc" } as TipTapDoc;

    expect(decideOnSync(false, a, b)).toBe("none");
  });

  it("notices a change nested deep in the document", () => {
    const a = doc("one");
    const b = doc("two");
    expect(decideOnSync(false, a, b)).toBe("save");
  });

  it("notices a document that gained a node", () => {
    const longer: TipTapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "one" }] },
        { type: "paragraph", content: [{ type: "text", text: "two" }] },
      ],
    };
    expect(decideOnSync(false, longer, doc("one"))).toBe("save");
  });
});
