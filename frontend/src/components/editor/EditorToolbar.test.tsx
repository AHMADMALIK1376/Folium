import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/documents", () => ({
  uploadAttachment: vi.fn(),
  attachmentRawUrl: (id: string, attachmentId: string) =>
    `/api/v1/documents/${id}/attachments/${attachmentId}/raw`,
}));

const { EditorToolbar } = await import("./EditorToolbar");

/** A stand-in for TipTap's chained command API.
 *
 * `editor.chain().focus().toggleBold().run()` — every link returns the chain, so
 * one recording proxy covers all of them and the test can assert which command
 * was reached without a real ProseMirror instance.
 */
function makeEditor(active: string[] = []) {
  const called: string[] = [];

  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_target, property: string) => {
        if (property === "run") return () => true;
        return (...args: unknown[]) => {
          called.push(
            args.length ? `${property}:${JSON.stringify(args[0])}` : property,
          );
          return chain;
        };
      },
    },
  );

  return {
    called,
    editor: {
      chain: () => chain,
      isActive: (name: string, attrs?: Record<string, number>) =>
        active.includes(attrs ? `${name}:${attrs.level}` : name),
      // Change Case asks whether there is a selection to change: without one
      // there is nothing to do, and the button says so rather than doing
      // nothing quietly.
      state: {
        selection: { from: 0, to: 0 },
        doc: { textBetween: () => "" },
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("EditorToolbar", () => {
  it("offers every type the editor's schema permits", () => {
    // The Phase 6-i rule: what the schema allows, the toolbar shows. Leaving a
    // type out does not disable it — it only hides it from the person writing,
    // which is how blockquotes and code blocks went unexported for months.
    const { editor } = makeEditor();
    render(<EditorToolbar editor={editor as never} documentId="doc-1" />);

    for (const label of [
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline code",
      "Link",
      "Insert image",
      "Highlight",
      "Subscript",
      "Superscript",
      "Clear formatting",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Paragraph",
      "Quote",
      "Code block",
      "Divider",
      "Bulleted list",
      "Numbered list",
      "Checklist",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it.each([
    ["Strikethrough", "toggleStrike"],
    ["Inline code", "toggleCode"],
    ["Quote", "toggleBlockquote"],
    ["Code block", "toggleCodeBlock"],
    ["Divider", "setHorizontalRule"],
    ["Checklist", "toggleTaskList"],
    ["Highlight", "toggleHighlight"],
    ["Subscript", "toggleSubscript"],
    ["Superscript", "toggleSuperscript"],
    ["Clear formatting", "unsetAllMarks"],
  ])("%s runs %s", async (label, command) => {
    const { editor, called } = makeEditor();
    render(<EditorToolbar editor={editor as never} documentId="doc-1" />);

    await userEvent.click(screen.getByRole("button", { name: label }));

    expect(called).toContain(command);
    // Focus is chained first so the command applies to the selection rather
    // than to wherever the caret drifted when the button took focus.
    expect(called[0]).toBe("focus");
  });

  it("reports active state to a screen reader, not just with a colour", () => {
    const { editor } = makeEditor(["blockquote", "strike"]);
    render(<EditorToolbar editor={editor as never} documentId="doc-1" />);

    expect(screen.getByRole("button", { name: "Quote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Strikethrough" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("never claims the divider is active", () => {
    // It inserts a rule at the caret; there is no state to be in, so a pressed
    // state would be a lie to anyone reading the page with a screen reader.
    const { editor } = makeEditor(["horizontalRule"]);
    render(<EditorToolbar editor={editor as never} documentId="doc-1" />);

    expect(screen.getByRole("button", { name: "Divider" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("distinguishes heading levels", () => {
    const { editor } = makeEditor(["heading:2"]);
    render(<EditorToolbar editor={editor as never} documentId="doc-1" />);

    expect(screen.getByRole("button", { name: "Heading 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Heading 1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("keeps focus in the editor when a control is pressed", async () => {
    // Without preventDefault on mousedown, clicking Bold with text selected
    // collapses the selection and formats nothing.
    const { editor } = makeEditor();
    render(<EditorToolbar editor={editor as never} documentId="doc-1" />);

    const button = screen.getByRole("button", { name: "Bold" });
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
