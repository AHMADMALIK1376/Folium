import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TableControls } from "./TableControls";

function makeEditor({ inTable = true } = {}) {
  const called: string[] = [];

  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, property: string) => {
        if (property === "run") return () => true;
        return () => {
          called.push(property);
          return chain;
        };
      },
    },
  );

  return { called, editor: { chain: () => chain, isActive: () => inTable } };
}

beforeEach(() => vi.clearAllMocks());

describe("TableControls", () => {
  it("stays hidden outside a table", () => {
    // Otherwise these are six more permanently-inert buttons in a toolbar that
    // is already long.
    const { editor } = makeEditor({ inTable: false });
    render(<TableControls editor={editor as never} />);

    expect(screen.queryByRole("toolbar", { name: /table/i })).not.toBeInTheDocument();
  });

  it("appears when the caret is inside a table", () => {
    const { editor } = makeEditor();
    render(<TableControls editor={editor as never} />);

    expect(screen.getByRole("toolbar", { name: /table/i })).toBeInTheDocument();
  });

  it.each([
    ["Row above", "addRowBefore"],
    ["Row below", "addRowAfter"],
    ["Delete row", "deleteRow"],
    ["Column left", "addColumnBefore"],
    ["Column right", "addColumnAfter"],
    ["Delete column", "deleteColumn"],
    ["Delete table", "deleteTable"],
  ])("%s runs %s", async (label, command) => {
    const { editor, called } = makeEditor();
    render(<TableControls editor={editor as never} />);

    await userEvent.click(screen.getByRole("button", { name: label }));

    expect(called).toContain(command);
    // Focus first, so the command applies to the cell the caret is in rather
    // than to wherever it landed when the button was pressed.
    expect(called[0]).toBe("focus");
  });

  it("keeps the caret in the cell when a control is pressed", () => {
    const { editor } = makeEditor();
    render(<TableControls editor={editor as never} />);

    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "Row above" }).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
