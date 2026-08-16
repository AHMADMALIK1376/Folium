import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setStarred = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  setStarred: (...a: unknown[]) => setStarred(...a),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { StarButton } = await import("./StarButton");

beforeEach(() => {
  vi.clearAllMocks();
  setStarred.mockResolvedValue(undefined);
});

describe("StarButton", () => {
  it("stars an unstarred document", async () => {
    render(<StarButton documentId="doc-1" starred={false} />);

    await userEvent.click(screen.getByRole("button", { name: /star this document/i }));

    await waitFor(() => expect(setStarred).toHaveBeenCalledWith("doc-1", true));
  });

  it("removes a star", async () => {
    render(<StarButton documentId="doc-1" starred />);

    await userEvent.click(screen.getByRole("button", { name: /remove star/i }));

    await waitFor(() => expect(setStarred).toHaveBeenCalledWith("doc-1", false));
  });

  it("fills the star immediately rather than waiting for the round trip", async () => {
    // A star is a bookmark. Waiting to see whether it took is more disruptive
    // than the rare failure that would report.
    let resolve: () => void = () => {};
    setStarred.mockReturnValue(new Promise<void>((r) => (resolve = r)));

    render(<StarButton documentId="doc-1" starred={false} />);
    await userEvent.click(screen.getByRole("button", { name: /star this document/i }));

    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    resolve();
  });

  it("puts the star back when the request fails", async () => {
    // Which is also how the failure is reported: the star returning to empty
    // says it did not take, without a message to dismiss.
    setStarred.mockRejectedValue(new Error("offline"));

    render(<StarButton documentId="doc-1" starred={false} />);
    await userEvent.click(screen.getByRole("button", { name: /star this document/i }));

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false"),
    );
  });

  it("refreshes so the Starred page reflects the change", async () => {
    render(<StarButton documentId="doc-1" starred={false} />);

    await userEvent.click(screen.getByRole("button", { name: /star this document/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("does not refresh when the request failed", async () => {
    setStarred.mockRejectedValue(new Error("offline"));

    render(<StarButton documentId="doc-1" starred={false} />);
    await userEvent.click(screen.getByRole("button", { name: /star this document/i }));

    await waitFor(() => expect(setStarred).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });
});
