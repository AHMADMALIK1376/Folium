import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TextRange } from "@/lib/editor/anchors";

/** A ProseMirror-shaped stub.
 *
 * The real plugin is exercised directly in writingTools.test.ts against a real
 * document and the real schema. What is worth testing here is the bar: what it
 * reports, what it offers to whom, and what it dispatches.
 */
/** A chainable transaction stub. Annotated because every builder returns the
 *  object itself, which TypeScript cannot infer from a self-referencing
 *  initialiser. */
interface StubTransaction {
  setMeta: (...args: unknown[]) => StubTransaction;
  setSelection: (...args: unknown[]) => StubTransaction;
  scrollIntoView: () => StubTransaction;
  insertText?: ReturnType<typeof vi.fn>;
  doc: unknown;
}

function makeEditor(matches: TextRange[] = [], current = 0) {
  const dispatch = vi.fn();
  const listeners: Record<string, (() => void)[]> = {};
  const insertContentAt = vi.fn();
  const insertText = vi.fn();

  const tr: StubTransaction = {
    setMeta: vi.fn(function (this: unknown) {
      return tr;
    }),
    setSelection: vi.fn(function (this: unknown) {
      return tr;
    }),
    scrollIntoView: vi.fn(function (this: unknown) {
      return tr;
    }),
    insertText,
    doc: { textBetween: () => "" },
  };

  const chain = {
    focus: () => chain,
    insertContentAt: (...args: unknown[]) => (insertContentAt(...args), chain),
    run: vi.fn(),
  };

  return {
    editor: {
      isDestroyed: false,
      view: { dispatch },
      state: { tr, selection: { from: 0, to: 0 }, doc: {} },
      chain: () => chain,
      commands: { focus: vi.fn() },
      on: (event: string, fn: () => void) => {
        (listeners[event] ??= []).push(fn);
      },
      off: vi.fn(),
    },
    dispatch,
    insertContentAt,
    insertText,
    tr,
    fire: (event: string) => listeners[event]?.forEach((fn) => fn()),
    plugin: { query: null, matches, current, decorations: null },
  };
}

const pluginState = vi.fn();
vi.mock("@/lib/editor/findReplace", async () => {
  const actual = await vi.importActual<typeof import("@/lib/editor/findReplace")>(
    "@/lib/editor/findReplace",
  );
  return {
    ...actual,
    findReplaceKey: { getState: () => pluginState() },
  };
});

// Partial, not wholesale: findReplace.ts imports PluginKey from the same
// module, and replacing it entirely takes the module under test with it. Only
// TextSelection is stubbed, because the stub document here is not a real one.
vi.mock("@tiptap/pm/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tiptap/pm/state")>()),
  TextSelection: { create: (_doc: unknown, from: number, to: number) => ({ from, to }) },
}));

const { FindReplaceBar } = await import("./FindReplaceBar");

/** A host that owns the bar's open state, as DocumentEditor does. */
function Host({
  editor,
  canEdit,
  startOpen = false,
}: {
  editor: unknown;
  canEdit: boolean;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <FindReplaceBar
      editor={editor as never}
      canEdit={canEdit}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

async function openBar(canEdit = true, matches: TextRange[] = [], current = 0) {
  const harness = makeEditor(matches, current);
  pluginState.mockReturnValue(harness.plugin);

  render(<Host editor={harness.editor} canEdit={canEdit} />);
  await userEvent.keyboard("{Control>}f{/Control}");

  return harness;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FindReplaceBar", () => {
  it("stays out of the way until Ctrl+F", async () => {
    const harness = makeEditor();
    pluginState.mockReturnValue(harness.plugin);

    render(<Host editor={harness.editor} canEdit />);

    expect(screen.queryByRole("search")).not.toBeInTheDocument();

    await userEvent.keyboard("{Control>}f{/Control}");
    expect(await screen.findByRole("search", { name: /find in document/i })).toBeInTheDocument();
  });

  it("says nothing found rather than going silent", async () => {
    // After typing, an empty bar is indistinguishable from a control that has
    // stopped working.
    await openBar(true, []);

    await userEvent.type(screen.getByRole("textbox", { name: "Find" }), "absent");

    expect(await screen.findByText("0 results")).toBeInTheDocument();
  });

  it("reports which match you are on", async () => {
    await openBar(true, [
      { from: 1, to: 4 },
      { from: 10, to: 13 },
      { from: 20, to: 23 },
    ], 1);

    await userEvent.type(screen.getByRole("textbox", { name: "Find" }), "one");

    expect(await screen.findByText("2 of 3")).toBeInTheDocument();
  });

  it("shows no count before anything is typed", async () => {
    await openBar(true, []);

    expect(screen.queryByText(/results|of/)).not.toBeInTheDocument();
  });

  it("gives a viewer find and no replace", async () => {
    // Replace writes the document. Offering it to someone who may not would be
    // a control that only ever collects errors.
    await openBar(false, [{ from: 1, to: 4 }]);

    expect(screen.getByRole("textbox", { name: "Find" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /replace/i })).not.toBeInTheDocument();
  });

  it("offers replace to an editor", async () => {
    await openBar(true, [{ from: 1, to: 4 }]);

    await userEvent.click(screen.getByRole("button", { name: /replace…/i }));

    expect(screen.getByLabelText(/replace with/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^replace all$/i })).toBeInTheDocument();
  });

  it("replaces every match in one transaction, back to front", async () => {
    // One transaction so it is one undo step; back to front because replacing
    // text of a different length moves everything after it.
    const harness = await openBar(true, [
      { from: 1, to: 4 },
      { from: 10, to: 13 },
    ]);

    await userEvent.type(screen.getByRole("textbox", { name: "Find" }), "one");
    await userEvent.click(screen.getByRole("button", { name: /replace…/i }));
    await userEvent.type(screen.getByLabelText(/replace with/i), "two");
    await userEvent.click(screen.getByRole("button", { name: /^replace all$/i }));

    expect(harness.insertText.mock.calls).toEqual([
      ["two", 10, 13],
      ["two", 1, 4],
    ]);
    // One dispatch for the replacement itself.
    expect(harness.dispatch).toHaveBeenCalled();
  });

  it("will not offer replace when nothing matched", async () => {
    await openBar(true, []);

    await userEvent.click(screen.getByRole("button", { name: /replace…/i }));

    expect(screen.getByRole("button", { name: /^replace all$/i })).toBeDisabled();
  });

  it("toggles match case, and says which it is", async () => {
    await openBar(true, []);
    const toggle = screen.getByRole("button", { name: /match case/i });

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("closes on Escape", async () => {
    await openBar(true, []);

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("search")).not.toBeInTheDocument());
  });

  it("disables the arrows when there is nothing to step through", async () => {
    await openBar(true, []);

    expect(screen.getByRole("button", { name: /next match/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous match/i })).toBeDisabled();
  });
});
