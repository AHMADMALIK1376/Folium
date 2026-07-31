import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { VersionSummary } from "@/lib/api/types";

const listVersions = vi.fn();
const getVersion = vi.fn();
const restoreVersion = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  listVersions: (...a: unknown[]) => listVersions(...a),
  getVersion: (...a: unknown[]) => getVersion(...a),
  restoreVersion: (...a: unknown[]) => restoreVersion(...a),
}));

const { HistoryDialog } = await import("./HistoryDialog");

function version(overrides: Partial<VersionSummary> = {}): VersionSummary {
  return {
    id: "v1",
    created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    created_by: "u1",
    author_name: "Alice Chen",
    ...overrides,
  };
}

function doc(text: string) {
  return {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function open(canEdit = true, onRestored = vi.fn()) {
  render(
    <HistoryDialog documentId="doc-1" canEdit={canEdit} onRestored={onRestored} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /history/i }));
  await screen.findByRole("dialog");
  return onRestored;
}

describe("HistoryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listVersions.mockResolvedValue([version()]);
    getVersion.mockResolvedValue({ ...version(), content: doc("An earlier draft") });
  });

  it("lists versions with their author and age", async () => {
    await open();

    expect(await screen.findByText(/alice chen/i)).toBeInTheDocument();
    expect(screen.getByText(/1 hour ago/i)).toBeInTheDocument();
    expect(listVersions).toHaveBeenCalledWith("doc-1");
  });

  it("renders a deleted author as Unknown rather than crashing", async () => {
    // created_by is ON DELETE SET NULL, so history outlives the account.
    listVersions.mockResolvedValue([version({ created_by: null, author_name: null })]);

    await open();

    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();
  });

  it("explains an empty history instead of rendering a blank panel", async () => {
    listVersions.mockResolvedValue([]);

    await open();

    expect(await screen.findByText(/no earlier versions/i)).toBeInTheDocument();
  });

  it("previews a version's content, so nobody restores blind", async () => {
    await open();

    await userEvent.click(await screen.findByRole("button", { name: /alice chen/i }));

    expect(await screen.findByText(/an earlier draft/i)).toBeInTheDocument();
    expect(getVersion).toHaveBeenCalledWith("doc-1", "v1");
  });

  it("hands the restored content back to the editor", async () => {
    const restored = doc("An earlier draft");
    restoreVersion.mockResolvedValue({ id: "doc-1", content: restored });

    const onRestored = await open();
    await userEvent.click(await screen.findByRole("button", { name: /alice chen/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^restore$/i }));

    await waitFor(() => expect(restoreVersion).toHaveBeenCalledWith("doc-1", "v1"));
    // The editor holds the content, so it has to be told — a reload would be the
    // alternative, and it would throw away the user's scroll position for
    // nothing.
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(restored));
  });

  it("offers a viewer no way to restore", async () => {
    // The backend 404s their restore regardless; a button that only ever errors
    // is worse than no button.
    await open(false);

    await userEvent.click(await screen.findByRole("button", { name: /alice chen/i }));

    expect(screen.queryByRole("button", { name: /^restore$/i })).not.toBeInTheDocument();
    // They can still read the history and the preview.
    expect(await screen.findByText(/an earlier draft/i)).toBeInTheDocument();
  });

  it("re-reads the list when a restore fails as gone", async () => {
    restoreVersion.mockRejectedValue(new ApiError(404, "Version not found"));

    await open();
    await userEvent.click(await screen.findByRole("button", { name: /alice chen/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^restore$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer/i);
    // Leaving the vanished entry on screen would invite a second attempt at
    // something that cannot work.
    await waitFor(() => expect(listVersions).toHaveBeenCalledTimes(2));
  });

  it("shows the sign-in message for an expired session", async () => {
    restoreVersion.mockRejectedValue(new ApiError(401, "Not authenticated"));

    await open();
    await userEvent.click(await screen.findByRole("button", { name: /alice chen/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^restore$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/session has expired/i);
  });

  it("disables restore while the request is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    restoreVersion.mockReturnValue(new Promise((r) => (release = r)));

    await open();
    await userEvent.click(await screen.findByRole("button", { name: /alice chen/i }));
    const button = await screen.findByRole("button", { name: /^restore$/i });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    release({ id: "doc-1", content: doc("x") });
  });
});
