import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InsertControls } from "./InsertControls";

const bookmarksIn = vi.fn();
vi.mock("@/lib/editor/bookmarks", async (importOriginal) => ({
  // The slug rules are real logic and are tested directly in bookmarks.test.ts;
  // only the document walk is replaced, because there is no ProseMirror
  // document here to walk.
  ...(await importOriginal<typeof import("@/lib/editor/bookmarks")>()),
  bookmarksIn: (...args: unknown[]) => bookmarksIn(...args),
}));

function stubEditor({ empty = false }: { empty?: boolean } = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const run = vi.fn();
  const chain: Record<string, unknown> = { run };

  for (const name of [
    "focus",
    "insertContent",
    "setBookmark",
    "unsetMark",
    "insertTableOfContents",
  ]) {
    chain[name] = (...args: unknown[]) => {
      calls.push({ name, args });
      return chain;
    };
  }

  const editor = {
    chain: () => chain,
    state: { doc: {}, selection: { empty } },
  } as unknown as Editor;

  return { editor, calls };
}

describe("InsertControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookmarksIn.mockReturnValue([]);
  });

  it("offers the whole Insert row", () => {
    const { editor } = stubEditor();
    render(<InsertControls editor={editor} />);

    for (const name of [
      "Symbol",
      "Date and time",
      "Bookmark",
      "Cross-reference",
      "Table of contents",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("inserts a symbol as plain text", async () => {
    // The reason symbols are cheap: a character is not a node, so nothing here
    // touches the schema or the Markdown converters.
    const { editor, calls } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Symbol" }));
    await userEvent.click(screen.getByRole("button", { name: "Infinity" }));

    expect(calls.find((call) => call.name === "insertContent")?.args[0]).toBe("∞");
  });

  it("searches symbols by how someone would type them", async () => {
    const { editor } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Symbol" }));
    await userEvent.type(screen.getByRole("searchbox", { name: /search symbols/i }), "->");

    const results = screen.getByRole("group", { name: /search results/i });
    expect(results).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Right arrow" })).toBeInTheDocument();
  });

  it("says when a symbol search finds nothing", async () => {
    const { editor } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Symbol" }));
    await userEvent.type(screen.getByRole("searchbox", { name: /search symbols/i }), "zzzz");

    expect(screen.getByText(/nothing matching/i)).toBeVisible();
  });

  it("inserts a date as text, and says it will not change", async () => {
    const { editor, calls } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Date and time" }));
    // Word's "update automatically" makes the date change under whoever opens
    // the document next. This says which behaviour it has.
    expect(screen.getByText(/will not change later/i)).toBeVisible();

    const options = screen.getByRole("group", { name: /date formats/i });
    await userEvent.click(options.querySelectorAll("button")[0]);

    expect(calls.some((call) => call.name === "insertContent")).toBe(true);
  });

  it("refuses a bookmark with nothing selected", () => {
    // A bookmark is a mark, so it needs something to mark. Disabled with a
    // reason beats accepting the click and doing nothing visible.
    const { editor } = stubEditor({ empty: true });
    render(<InsertControls editor={editor} />);

    expect(screen.getByRole("button", { name: "Bookmark" })).toBeDisabled();
  });

  it("shows the slug as the name is typed", async () => {
    // The name is not kept verbatim -- it has to survive being an id and a URL
    // fragment. Finding that out afterwards would be worse than watching it.
    const { editor } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Bookmark" }));
    await userEvent.type(screen.getByRole("textbox", { name: /bookmark name/i }), "Methods & Materials");

    expect(screen.getByText(/methods-materials/)).toBeVisible();
  });

  it("refuses a name that would slugify to nothing", async () => {
    const { editor } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Bookmark" }));
    await userEvent.type(screen.getByRole("textbox", { name: /bookmark name/i }), "!!!");

    expect(screen.getByText(/leaves nothing to name/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /add bookmark/i })).toBeDisabled();
  });

  it("refuses a name already used in the document", async () => {
    bookmarksIn.mockReturnValue([{ name: "methods", text: "Methods", pos: 1 }]);
    const { editor } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Bookmark" }));
    await userEvent.type(screen.getByRole("textbox", { name: /bookmark name/i }), "Methods");

    expect(screen.getByText(/already used/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /add bookmark/i })).toBeDisabled();
  });

  it("adds a bookmark", async () => {
    const { editor, calls } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Bookmark" }));
    await userEvent.type(screen.getByRole("textbox", { name: /bookmark name/i }), "Results");
    await userEvent.click(screen.getByRole("button", { name: /add bookmark/i }));

    expect(calls.find((call) => call.name === "setBookmark")?.args[0]).toBe("Results");
  });

  it("offers no cross-reference until there is something to reference", () => {
    const { editor } = stubEditor();
    render(<InsertControls editor={editor} />);

    expect(screen.getByRole("button", { name: "Cross-reference" })).toBeDisabled();
  });

  it("inserts a cross-reference as an ordinary link to the bookmark", async () => {
    // The reason cross-references cost the schema nothing at all.
    bookmarksIn.mockReturnValue([{ name: "methods", text: "Methods", pos: 1 }]);
    const { editor, calls } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Cross-reference" }));
    await userEvent.click(screen.getByRole("button", { name: /Methods/ }));

    const inserted = calls.find((call) => call.name === "insertContent")?.args[0] as {
      marks: { type: string; attrs: { href: string } }[];
      text: string;
    };
    expect(inserted.text).toBe("Methods");
    expect(inserted.marks[0]).toEqual({ type: "link", attrs: { href: "#methods" } });

    // Or the next word typed joins the link.
    expect(calls.some((call) => call.name === "unsetMark")).toBe(true);
  });

  it("inserts a table of contents", async () => {
    const { editor, calls } = stubEditor();
    render(<InsertControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Table of contents" }));

    expect(calls.some((call) => call.name === "insertTableOfContents")).toBe(true);
  });
});
