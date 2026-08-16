import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SlashMenu } from "./SlashMenu";
import { SLASH_COMMANDS, filterCommands } from "./slashCommands";

/** A stand-in for TipTap, with just enough state for the menu's two questions:
 *  what precedes the caret, and is the selection empty. */
function makeEditor({ before = "", empty = true } = {}) {
  const called: string[] = [];
  const handlers: Record<string, (() => void)[]> = {};

  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, property: string) => {
        if (property === "run") return () => true;
        return (...args: unknown[]) => {
          called.push(args.length ? `${property}:${JSON.stringify(args[0])}` : property);
          return chain;
        };
      },
    },
  );

  const editor = {
    called,
    chain: () => chain,
    state: {
      selection: {
        empty,
        from: before.length + 1,
        $from: {
          parentOffset: before.length,
          parent: { textBetween: () => before },
        },
      },
    },
    on: (event: string, handler: () => void) => {
      (handlers[event] ??= []).push(handler);
    },
    off: () => {},
    fire: (event: string) => handlers[event]?.forEach((h) => h()),
  };

  return editor;
}

/** The menu reads the document on the editor's own events, so a test has to
 *  announce one — nothing renders on mount alone.
 *
 * Wrapped in act(): the handler sets state from outside React's own event
 * system, and without this the update never flushes and the menu stays absent
 * for a reason that has nothing to do with the component. */
function open(editor: ReturnType<typeof makeEditor>) {
  render(<SlashMenu editor={editor as never} />);
  act(() => editor.fire("update"));
}

beforeEach(() => vi.clearAllMocks());

describe("filterCommands", () => {
  it("returns everything for an empty query", () => {
    expect(filterCommands("")).toHaveLength(SLASH_COMMANDS.length);
  });

  it("matches on the label", () => {
    expect(filterCommands("quo").map((c) => c.label)).toEqual(["Quote"]);
  });

  it("matches on keywords, which is the point of having them", () => {
    // Someone reaching for a checklist types "todo", not "Checklist".
    expect(filterCommands("todo").map((c) => c.label)).toContain("Checklist");
    expect(filterCommands("hr").map((c) => c.label)).toContain("Divider");
  });

  it("ignores case and surrounding space", () => {
    expect(filterCommands("  QUOTE ").map((c) => c.label)).toEqual(["Quote"]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filterCommands("zzzz")).toEqual([]);
  });
});

describe("SlashMenu", () => {
  it("opens on a slash at the start of an empty block", () => {
    open(makeEditor({ before: "/" }));

    expect(screen.getByRole("listbox", { name: /insert a block/i })).toBeInTheDocument();
  });

  it("stays shut mid-sentence", () => {
    // Otherwise every URL, date and fraction opens a menu while someone writes.
    open(makeEditor({ before: "see http://x/y" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("stays shut when text is selected", () => {
    open(makeEditor({ before: "/", empty: false }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes once a space is typed", () => {
    // "/ something" is prose, not a command.
    open(makeEditor({ before: "/quote and" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("gives up on a long query rather than hanging around empty", () => {
    open(makeEditor({ before: "/" + "x".repeat(20) }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters as the query grows", () => {
    open(makeEditor({ before: "/quo" }));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Quote");
  });

  it("marks the first match as selected", () => {
    open(makeEditor({ before: "/" }));

    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("moves the selection with the arrow keys", async () => {
    open(makeEditor({ before: "/" }));

    await userEvent.keyboard("{ArrowDown}");

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });

  it("inserts on Enter and removes the typed command", async () => {
    const editor = makeEditor({ before: "/quo" });
    open(editor);

    await userEvent.keyboard("{Enter}");

    // The "/quo" is deleted first, or the command text stays in the document
    // next to the block it asked for.
    expect(editor.called.some((c) => c.startsWith("deleteRange"))).toBe(true);
    expect(editor.called).toContain("toggleBlockquote");
  });

  it("closes on Escape without inserting anything", async () => {
    const editor = makeEditor({ before: "/quo" });
    open(editor);

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(editor.called).toEqual([]);
  });

  it("renders nothing when the query matches nothing", () => {
    open(makeEditor({ before: "/zzzz" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("inserts on click too, without stealing focus", async () => {
    const editor = makeEditor({ before: "/quo" });
    open(editor);

    await userEvent.click(screen.getByRole("option", { name: "Quote" }));

    expect(editor.called).toContain("toggleBlockquote");
  });
});
