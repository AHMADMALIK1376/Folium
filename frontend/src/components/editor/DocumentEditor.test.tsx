import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { DocumentDetail, Permission } from "@/lib/api/types";

const updateDocument = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  updateDocument: (...args: unknown[]) => updateDocument(...args),
}));

/** ProseMirror needs DOM APIs jsdom does not have, and a test driving a mocked
 *  ProseMirror would prove nothing about editing anyway — Playwright covers the
 *  real editor in a real browser. What is worth testing here is everything
 *  around it: permissions, the title, and how a failed save reads. */
const setEditable = vi.fn();
vi.mock("@tiptap/react", () => ({
  useEditor: (options: { editable: boolean }) => ({
    isActive: () => false,
    setEditable,
    getJSON: () => ({ type: "doc", content: [] }),
    chain: () => ({
      focus: () => ({
        toggleBold: () => ({ run: vi.fn() }),
        toggleItalic: () => ({ run: vi.fn() }),
        toggleUnderline: () => ({ run: vi.fn() }),
        toggleHeading: () => ({ run: vi.fn() }),
        setParagraph: () => ({ run: vi.fn() }),
        toggleBulletList: () => ({ run: vi.fn() }),
        toggleOrderedList: () => ({ run: vi.fn() }),
      }),
    }),
    isEditable: options.editable,
  }),
  EditorContent: () => <div data-testid="editor-content" />,
}));

const { DocumentEditor } = await import("./DocumentEditor");

function makeDocument(permission: Permission): DocumentDetail {
  return {
    id: "doc-1",
    title: "Quarterly plan",
    owner_id: "u1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    content: { type: "doc", content: [] },
    permission,
    owner: {
      id: "u1",
      email: "owner@example.com",
      display_name: "Owner",
      avatar_url: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

describe("DocumentEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gives an owner a toolbar and an editable title", () => {
    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(screen.getByRole("button", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /document title/i })).toBeInTheDocument();
  });

  it("gives an editor the same controls as an owner", () => {
    render(<DocumentEditor document={makeDocument("edit")} />);

    expect(screen.getByRole("button", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /document title/i })).toBeInTheDocument();
  });

  it("offers a view-only user no way to edit", () => {
    // The backend 404s a PATCH from a non-editor, so a toolbar here could only
    // ever produce an error the user cannot act on.
    render(<DocumentEditor document={makeDocument("view")} />);

    expect(screen.queryByRole("button", { name: /bold/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /document title/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByText(/quarterly plan/i)).toBeInTheDocument();
  });

  it("treats comment permission as read-only this phase", () => {
    // Commenting is not built. Offering a comment UI that cannot save would be
    // worse than not offering one.
    render(<DocumentEditor document={makeDocument("comment")} />);

    expect(screen.queryByRole("button", { name: /bold/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("starts out saying the document is saved", () => {
    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  });

  it("saves a renamed title", async () => {
    updateDocument.mockResolvedValue(makeDocument("owner"));

    render(<DocumentEditor document={makeDocument("owner")} />);
    const title = screen.getByRole("textbox", { name: /document title/i });
    await userEvent.clear(title);
    await userEvent.type(title, "Renamed");

    await waitFor(
      () =>
        expect(updateDocument).toHaveBeenCalledWith(
          "doc-1",
          expect.objectContaining({ title: "Renamed" }),
          undefined,
        ),
      { timeout: 3000 },
    );
  });

  it("never sends a blank title, and restores the last one on blur", async () => {
    // The backend rejects a blank title with a 422, so sending one produces an
    // error for something the UI can simply decline to do.
    render(<DocumentEditor document={makeDocument("owner")} />);
    const title = screen.getByRole("textbox", { name: /document title/i });
    await userEvent.clear(title);
    await userEvent.tab();

    expect(title).toHaveValue("Quarterly plan");
    await waitFor(() => expect(updateDocument).not.toHaveBeenCalled(), { timeout: 1500 });
  });

  it("says so when a save fails, and does not claim to be saved", async () => {
    updateDocument.mockRejectedValue(new Error("boom"));

    render(<DocumentEditor document={makeDocument("owner")} />);
    await userEvent.type(
      screen.getByRole("textbox", { name: /document title/i }),
      "!",
    );

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent(/could not save/i);
    expect(screen.getByRole("status")).not.toHaveTextContent(/^saved$/i);
  });

  it("tells a signed-out user to sign in again rather than to retry", async () => {
    updateDocument.mockRejectedValue(new ApiError(401, "Not authenticated"));

    render(<DocumentEditor document={makeDocument("owner")} />);
    await userEvent.type(
      screen.getByRole("textbox", { name: /document title/i }),
      "!",
    );

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent(/session has expired/i);
  });

  it("announces save status changes to a screen reader", () => {
    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
