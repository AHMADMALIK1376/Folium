import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FormattingControls } from "./FormattingControls";

/** A chain that records what was asked of it.
 *
 * Every command returns the chain so `.focus().setColor(x).run()` works, and
 * `calls` holds the names and arguments in order. Asserting on that is the
 * point: these controls have no output of their own, they only ever tell the
 * editor to do something.
 */
function stubEditor(attributes: Record<string, Record<string, unknown>> = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const run = vi.fn();

  const chain: Record<string, unknown> = { run };
  for (const name of [
    "focus",
    "setColor",
    "unsetColor",
    "setHighlight",
    "unsetHighlight",
    "setFontSize",
    "unsetFontSize",
    "setFontFamily",
    "unsetFontFamily",
    "setTextAlign",
  ]) {
    chain[name] = (...args: unknown[]) => {
      calls.push({ name, args });
      return chain;
    };
  }

  const editor = {
    chain: () => chain,
    getAttributes: (name: string) => attributes[name] ?? {},
    isActive: (query: unknown) =>
      typeof query === "object" &&
      query !== null &&
      (query as { textAlign?: string }).textAlign === attributes.__active?.textAlign,
  } as unknown as Editor;

  return { editor, calls, run };
}

describe("FormattingControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers the four alignments, justify included", () => {
    const { editor } = stubEditor();
    render(<FormattingControls editor={editor} />);

    for (const label of ["Align left", "Align centre", "Align right", "Justify"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("sets a text colour from the palette", async () => {
    const { editor, calls, run } = stubEditor();
    render(<FormattingControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Text colour" }));
    await userEvent.click(screen.getByRole("button", { name: "Blue" }));

    expect(calls.map((call) => call.name)).toContain("setColor");
    expect(calls.find((call) => call.name === "setColor")?.args[0]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(run).toHaveBeenCalled();
  });

  it("removes the colour rather than setting a colourless one", async () => {
    // "Remove" has to reach unsetColor. Setting black instead would look right
    // on a white page and be wrong: the text would stop following the
    // document's own colour.
    const { editor, calls } = stubEditor({ textStyle: { color: "#1d4ed8" } });
    render(<FormattingControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Text colour" }));
    await userEvent.click(screen.getByRole("button", { name: /remove text colour/i }));

    expect(calls.map((call) => call.name)).toContain("unsetColor");
  });

  it("sets a highlight with a colour, not the one fixed yellow", async () => {
    const { editor, calls } = stubEditor();
    render(<FormattingControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Highlight" }));
    await userEvent.click(screen.getByRole("button", { name: "Pink" }));

    const call = calls.find((entry) => entry.name === "setHighlight");
    expect(call?.args[0]).toEqual({ color: expect.stringMatching(/^#[0-9a-f]{6}$/i) });
  });

  it("shows the document's own size when nothing is sized", () => {
    const { editor } = stubEditor();
    render(<FormattingControls editor={editor} />);

    // Not an empty box: the text on screen has a size, so claiming otherwise
    // would be less true rather than more careful.
    expect(screen.getByRole("combobox", { name: "Font size" })).toHaveValue("12");
  });

  it("grows and shrinks from the current size", async () => {
    const { editor, calls } = stubEditor({ textStyle: { fontSize: "16pt" } });
    render(<FormattingControls editor={editor} />);

    await userEvent.click(screen.getByRole("button", { name: "Grow font" }));
    expect(calls.find((call) => call.name === "setFontSize")?.args[0]).toBe(18);

    calls.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "Shrink font" }));
    expect(calls.find((call) => call.name === "setFontSize")?.args[0]).toBe(14);
  });

  it("offers a size the document brought with it, so the box never lies", async () => {
    // An imported document can hold 13pt, which is not on the ladder. Without
    // this the select shows 12 while the text is 13.
    const { editor } = stubEditor({ textStyle: { fontSize: "13pt" } });
    render(<FormattingControls editor={editor} />);

    expect(screen.getByRole("combobox", { name: "Font size" })).toHaveValue("13");
  });
});
