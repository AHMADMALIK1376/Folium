import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { Share } from "@/lib/api/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const listShares = vi.fn();
const createShare = vi.fn();
const updateShare = vi.fn();
const deleteShare = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  listShares: (...a: unknown[]) => listShares(...a),
  createShare: (...a: unknown[]) => createShare(...a),
  updateShare: (...a: unknown[]) => updateShare(...a),
  deleteShare: (...a: unknown[]) => deleteShare(...a),
}));

const { ShareDialog } = await import("./ShareDialog");

function share(overrides: Partial<Share> = {}): Share {
  return {
    user_id: "u2",
    email: "friend@example.com",
    display_name: "Friend",
    permission: "edit",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

async function open() {
  render(<ShareDialog documentId="doc-1" />);
  await userEvent.click(screen.getByRole("button", { name: /share/i }));
  return screen.findByRole("dialog");
}

describe("ShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listShares.mockResolvedValue([]);
  });

  it("lists who the document is shared with", async () => {
    listShares.mockResolvedValue([share()]);

    const dialog = await open();

    expect(await screen.findByText("friend@example.com")).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/friend/i);
    expect(listShares).toHaveBeenCalledWith("doc-1");
  });

  it("explains itself when the document is shared with nobody", async () => {
    await open();

    expect(await screen.findByText(/not shared with anyone/i)).toBeInTheDocument();
  });

  it("offers all three levels, comment included", async () => {
    // Withheld for thirteen phases because it did nothing: granting it would
    // have handed someone a document they could neither comment on nor edit.
    // Phase 14 built commenting, so it is grantable now.
    listShares.mockResolvedValue([share({ permission: "comment" })]);

    await open();
    // Two selects carry it now — the existing share's and the new share's —
    // which is the point: it is an ordinary level like the other two.
    expect(await screen.findAllByRole("option", { name: /can comment/i })).toHaveLength(2);

    const selectable = screen
      .getAllByRole("option")
      .filter((option) => !(option as HTMLOptionElement).disabled)
      .map((option) => option.textContent);
    expect(selectable.join(" ")).toMatch(/can view/i);
    expect(selectable.join(" ")).toMatch(/can comment/i);
    expect(selectable.join(" ")).toMatch(/can edit/i);
  });

  it("shares with an email and the chosen permission", async () => {
    createShare.mockResolvedValue(share({ permission: "view" }));

    await open();
    await userEvent.type(
      screen.getByRole("textbox", { name: /email/i }),
      "new@example.com",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /permission for the new/i }),
      "view",
    );
    await userEvent.click(screen.getByRole("button", { name: /^share$/i }));

    await waitFor(() =>
      expect(createShare).toHaveBeenCalledWith("doc-1", "new@example.com", "view"),
    );
    // Re-listed rather than patched locally: the server is the source of truth,
    // and two tabs must not diverge.
    await waitFor(() => expect(listShares).toHaveBeenCalledTimes(2));
  });

  it("shows the backend's own words when the address has no account", async () => {
    // "No user with that email" is specific and actionable. A generic "could not
    // share" would leave the owner guessing whether they mistyped.
    createShare.mockRejectedValue(new ApiError(422, "No user with that email"));

    await open();
    await userEvent.type(
      screen.getByRole("textbox", { name: /email/i }),
      "nobody@example.com",
    );
    await userEvent.click(screen.getByRole("button", { name: /^share$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no user with that email/i,
    );
  });

  it("falls back to the shared treatment for an expired session", async () => {
    createShare.mockRejectedValue(new ApiError(401, "Not authenticated"));

    await open();
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: /^share$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/session has expired/i);
  });

  it("says the document is gone when a mutation 404s", async () => {
    createShare.mockRejectedValue(new ApiError(404, "Document not found"));

    await open();
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: /^share$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no longer available|does not exist/i,
    );
  });

  it("never posts an empty email", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: /^share$/i }));

    expect(createShare).not.toHaveBeenCalled();
  });

  it("changes a collaborator's permission", async () => {
    listShares.mockResolvedValue([share({ permission: "view" })]);
    updateShare.mockResolvedValue(null);

    await open();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: /permission for friend/i }),
      "edit",
    );

    await waitFor(() => expect(updateShare).toHaveBeenCalledWith("doc-1", "u2", "edit"));
  });

  it("removes a collaborator", async () => {
    listShares.mockResolvedValue([share()]);
    deleteShare.mockResolvedValue(null);

    await open();
    await userEvent.click(
      await screen.findByRole("button", { name: /remove friend/i }),
    );

    await waitFor(() => expect(deleteShare).toHaveBeenCalledWith("doc-1", "u2"));
  });

  it("treats an already-removed share as success", async () => {
    listShares.mockResolvedValue([share()]);
    deleteShare.mockRejectedValue(new ApiError(404, "Share not found"));

    await open();
    await userEvent.click(
      await screen.findByRole("button", { name: /remove friend/i }),
    );

    // The owner's intent is satisfied. An error for "already gone" is noise.
    await waitFor(() => expect(listShares).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables the share button while the request is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    createShare.mockReturnValue(new Promise((r) => (release = r)));

    await open();
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "a@b.co");
    const button = screen.getByRole("button", { name: /^share$/i });
    await userEvent.click(button);

    // Without this, a double-click posts twice.
    expect(button).toBeDisabled();
    release(share());
  });
});
