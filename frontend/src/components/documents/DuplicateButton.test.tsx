import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const duplicateDocument = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  duplicateDocument: (...a: unknown[]) => duplicateDocument(...a),
}));

const { DuplicateButton } = await import("./DuplicateButton");

beforeEach(() => {
  vi.clearAllMocks();
  duplicateDocument.mockResolvedValue({ id: "copy-1" });
});

describe("DuplicateButton", () => {
  it("names the document it copies, so a row of them is not identical", async () => {
    // A screen reader hearing "Duplicate, Duplicate, Duplicate" learns nothing
    // about which document each button belongs to.
    render(<DuplicateButton documentId="doc-1" title="Quarterly plan" />);

    expect(
      screen.getByRole("button", { name: "Duplicate Quarterly plan" }),
    ).toBeInTheDocument();
  });

  it("copies, then refreshes so the copy appears", async () => {
    render(<DuplicateButton documentId="doc-1" title="Quarterly plan" />);

    await userEvent.click(screen.getByRole("button", { name: /duplicate/i }));

    expect(duplicateDocument).toHaveBeenCalledWith("doc-1");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("cannot be clicked twice into two copies", async () => {
    // Copying attachments is not instant, and a second click during it would
    // make a second document.
    let release: (value: unknown) => void = () => {};
    duplicateDocument.mockReturnValue(new Promise((resolve) => (release = resolve)));

    render(<DuplicateButton documentId="doc-1" title="Quarterly plan" />);
    const button = screen.getByRole("button", { name: /duplicate/i });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByText(/copying/i)).toBeInTheDocument();

    release({ id: "copy-1" });
    await waitFor(() => expect(duplicateDocument).toHaveBeenCalledTimes(1));
  });

  it("says so when the copy fails, rather than looking like it worked", async () => {
    duplicateDocument.mockRejectedValue(new Error("offline"));

    render(<DuplicateButton documentId="doc-1" title="Quarterly plan" />);
    await userEvent.click(screen.getByRole("button", { name: /duplicate/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /duplicate/i })).toHaveAttribute(
        "title",
        expect.stringMatching(/could not duplicate/i),
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
