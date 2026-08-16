import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LinkDialog, normaliseUrl } from "./LinkDialog";

/** Records the chained commands, as EditorToolbar.test.tsx does. */
function makeEditor({ active = false, href = "" } = {}) {
  const called: string[] = [];

  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_target, property: string) => {
        if (property === "run") return () => true;
        return (...args: unknown[]) => {
          called.push(args.length ? `${property}:${JSON.stringify(args[0])}` : property);
          return chain;
        };
      },
    },
  );

  return {
    called,
    editor: {
      chain: () => chain,
      isActive: () => active,
      getAttributes: () => ({ href }),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("normaliseUrl", () => {
  it("keeps an allowed absolute URL as it is", () => {
    expect(normaliseUrl("https://example.com")).toBe("https://example.com");
    expect(normaliseUrl("http://example.com")).toBe("http://example.com");
    expect(normaliseUrl("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  it("assumes https for a bare domain, which is what people type", () => {
    expect(normaliseUrl("example.com")).toBe("https://example.com");
    expect(normaliseUrl("  example.com/docs  ")).toBe("https://example.com/docs");
  });

  it("leaves a relative path alone", () => {
    expect(normaliseUrl("/about")).toBe("/about");
  });

  it("refuses a script URL rather than repairing it", () => {
    // The security case: an href the READER's browser executes, on a document
    // they may only be permitted to view. Returning null so the caller reports
    // it — silently rewriting would leave the author believing they linked
    // somewhere they did not.
    expect(normaliseUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("JavaScript:alert(1)")).toBeNull();
    expect(normaliseUrl("  javascript:alert(1)")).toBeNull();
    expect(normaliseUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(normaliseUrl("vbscript:msgbox(1)")).toBeNull();
    expect(normaliseUrl("file:///etc/passwd")).toBeNull();
  });

  it("refuses an empty address", () => {
    expect(normaliseUrl("")).toBeNull();
    expect(normaliseUrl("   ")).toBeNull();
  });
});

describe("LinkDialog", () => {
  it("applies a link to the selection", async () => {
    const { editor, called } = makeEditor();
    render(<LinkDialog editor={editor as never} />);

    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    await userEvent.type(screen.getByLabelText(/address/i), "example.com");
    await userEvent.click(screen.getByRole("button", { name: /add link/i }));

    expect(called).toContain('setLink:{"href":"https://example.com"}');
    // extendMarkRange so editing works with the caret merely inside the link,
    // not only with the whole thing selected.
    expect(called).toContain("extendMarkRange:\"link\"");
  });

  it("refuses a script URL and applies nothing", async () => {
    const { editor, called } = makeEditor();
    render(<LinkDialog editor={editor as never} />);

    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    await userEvent.type(screen.getByLabelText(/address/i), "javascript:alert(1)");
    await userEvent.click(screen.getByRole("button", { name: /add link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be used/i);
    expect(called.some((c) => c.startsWith("setLink"))).toBe(false);
    // Left open so the address can be corrected.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("pre-fills the existing address when editing", async () => {
    const { editor } = makeEditor({ active: true, href: "https://example.com/docs" });
    render(<LinkDialog editor={editor as never} />);

    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(screen.getByLabelText(/address/i)).toHaveValue("https://example.com/docs");
  });

  it("removes a link", async () => {
    const { editor, called } = makeEditor({ active: true, href: "https://example.com" });
    render(<LinkDialog editor={editor as never} />);

    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    await userEvent.click(screen.getByRole("button", { name: /remove link/i }));

    expect(called).toContain("unsetLink");
  });

  it("offers no remove control when there is no link", async () => {
    const { editor } = makeEditor();
    render(<LinkDialog editor={editor as never} />);

    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(screen.queryByRole("button", { name: /remove link/i })).not.toBeInTheDocument();
  });

  it("reports active state when the caret is inside a link", () => {
    const { editor } = makeEditor({ active: true, href: "https://example.com" });
    render(<LinkDialog editor={editor as never} />);

    expect(screen.getByRole("button", { name: "Link" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("applies on Enter, so the mouse is optional", async () => {
    const { editor, called } = makeEditor();
    render(<LinkDialog editor={editor as never} />);

    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    await userEvent.type(screen.getByLabelText(/address/i), "example.com{Enter}");

    expect(called).toContain('setLink:{"href":"https://example.com"}');
  });
});
