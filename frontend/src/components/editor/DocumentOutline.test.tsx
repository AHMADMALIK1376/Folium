import { getSchema } from "@tiptap/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { baseExtensions } from "@/lib/editor/extensions";

/** A real schema and a real document, with a stubbed view.
 *
 * The outline is a pure function of the document, so there is no reason to fake
 * the document — only the parts of the editor that talk to a browser. */
const schema = getSchema(baseExtensions({ withHistory: true }));

function docOf(...blocks: ({ heading: number; text: string } | string)[]) {
  return schema.nodeFromJSON({
    type: "doc",
    content: blocks.map((block) =>
      typeof block === "string"
        ? { type: "paragraph", content: [{ type: "text", text: block }] }
        : {
            type: "heading",
            attrs: { level: block.heading },
            content: [{ type: "text", text: block.text }],
          },
    ),
  });
}

const dispatch = vi.fn();
const focus = vi.fn();

/** A chainable transaction stub. Annotated because every builder returns the
 *  object itself, which TypeScript cannot infer from a self-referencing
 *  initialiser. */
interface StubTransaction {
  setSelection: (...args: unknown[]) => StubTransaction;
  scrollIntoView: () => StubTransaction;
  doc: unknown;
}

function editorWith(doc: ReturnType<typeof docOf>) {
  const tr: StubTransaction = {
    setSelection: vi.fn(function (this: unknown) {
      return tr;
    }),
    scrollIntoView: vi.fn(function (this: unknown) {
      return tr;
    }),
    doc,
  };
  return {
    state: { doc, tr, selection: { from: 0, to: 0 } },
    view: { dispatch },
    commands: { focus },
    on: vi.fn(),
    off: vi.fn(),
  };
}

vi.mock("@tiptap/pm/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tiptap/pm/state")>()),
  TextSelection: { create: (_doc: unknown, pos: number) => ({ pos }) },
}));

const { DocumentOutline } = await import("./DocumentOutline");

beforeEach(() => vi.clearAllMocks());

describe("DocumentOutline", () => {
  it("lists the headings, indented by level", () => {
    render(
      <DocumentOutline
        editor={
          editorWith(
            docOf(
              { heading: 1, text: "Introduction" },
              "prose",
              { heading: 2, text: "Background" },
            ),
          ) as never
        }
      />,
    );

    expect(screen.getByRole("navigation", { name: /document outline/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Introduction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Background" })).toBeInTheDocument();
  });

  it("is absent when the document has no headings", () => {
    // An outline with nothing in it promises a structure the document has not
    // got, and takes up space to do it.
    const { container } = render(
      <DocumentOutline editor={editorWith(docOf("just prose", "and more")) as never} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("is absent without an editor", () => {
    const { container } = render(<DocumentOutline editor={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("names an empty heading rather than showing a blank row", () => {
    render(<DocumentOutline editor={editorWith(docOf({ heading: 2, text: " " })) as never} />);

    expect(screen.getByRole("button", { name: /untitled heading/i })).toBeInTheDocument();
  });

  it("scrolls to a heading when it is clicked", async () => {
    render(
      <DocumentOutline
        editor={editorWith(docOf("prose", { heading: 2, text: "Findable" })) as never}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Findable" }));

    expect(dispatch).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it("can be collapsed, and says whether it is", async () => {
    render(<DocumentOutline editor={editorWith(docOf({ heading: 1, text: "One" })) as never} />);
    const toggle = screen.getByRole("button", { name: /outline/i });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "One" })).not.toBeInTheDocument();
  });
});
