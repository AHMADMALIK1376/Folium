import { getSchema } from "@tiptap/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WORDS_PER_MINUTE } from "@/lib/editor/document";
import { baseExtensions } from "@/lib/editor/extensions";

import { DocumentStats } from "./DocumentStats";

const schema = getSchema(baseExtensions({ withHistory: true }));

function editorWith(text: string, selection = { from: 0, to: 0 }) {
  const doc = schema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
    ],
  });
  return { state: { doc, selection }, on: vi.fn(), off: vi.fn() };
}

describe("DocumentStats", () => {
  it("counts words and characters", () => {
    render(<DocumentStats editor={editorWith("one two three") as never} />);

    expect(screen.getByText("3 words")).toBeInTheDocument();
    expect(screen.getByText("13 characters")).toBeInTheDocument();
  });

  it("uses the singular for one", () => {
    render(<DocumentStats editor={editorWith("one") as never} />);

    expect(screen.getByText("1 word")).toBeInTheDocument();
  });

  it("says nothing about reading time for an empty document", () => {
    // "0 min read" is not a thing anyone wants to be told.
    render(<DocumentStats editor={editorWith("") as never} />);

    expect(screen.queryByText(/min read/)).not.toBeInTheDocument();
    expect(screen.getByText("0 words")).toBeInTheDocument();
  });

  it("reports a reading time once there is something to read", () => {
    render(<DocumentStats editor={editorWith("one two three") as never} />);

    expect(screen.getByText("1 min read")).toBeInTheDocument();
  });

  it("rounds reading time up rather than down", () => {
    const words = Array.from({ length: WORDS_PER_MINUTE + 1 }, () => "word").join(" ");

    render(<DocumentStats editor={editorWith(words) as never} />);

    expect(screen.getByText("2 min read")).toBeInTheDocument();
  });

  it("counts the selection when there is one, and says so", () => {
    // What Word does, and what people reach for when they need to know how long
    // a paragraph is.
    render(
      <DocumentStats editor={editorWith("one two three four", { from: 1, to: 8 }) as never} />,
    );

    expect(screen.getByText("2 words selected")).toBeInTheDocument();
  });

  it("is absent without an editor", () => {
    const { container } = render(<DocumentStats editor={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
