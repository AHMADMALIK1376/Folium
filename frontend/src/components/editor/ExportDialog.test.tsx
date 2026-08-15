import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

const exportMarkdown = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  exportMarkdown: (...a: unknown[]) => exportMarkdown(...a),
}));

const { ExportDialog } = await import("./ExportDialog");

/** jsdom implements neither printing nor object URLs. */
const print = vi.fn();
const createObjectURL = vi.fn(() => "blob:fake");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("print", print);
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, writable: true });
  exportMarkdown.mockResolvedValue({
    blob: new Blob(["# Hello"], { type: "text/markdown" }),
    filename: "quarterly-plan.md",
  });
});

async function open() {
  render(<ExportDialog documentId="doc-1" />);
  await userEvent.click(screen.getByRole("button", { name: /^export$/i }));
  return screen.findByRole("dialog");
}

describe("ExportDialog", () => {
  it("offers both formats", async () => {
    const dialog = await open();

    expect(dialog).toHaveTextContent(/markdown/i);
    expect(dialog).toHaveTextContent(/pdf/i);
  });

  it("downloads the file under the name the server chose", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await open();
    await userEvent.click(screen.getByRole("button", { name: /download as markdown/i }));

    await waitFor(() => expect(exportMarkdown).toHaveBeenCalledWith("doc-1"));
    await waitFor(() => expect(click).toHaveBeenCalled());
    // Revoked rather than left dangling: an object URL pins its blob in memory
    // until it is released.
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalled());

    click.mockRestore();
  });

  it("closes the dialog before printing", async () => {
    // The print stylesheet hides the application, but an open dialog is still
    // part of the page and would print over the document.
    await open();
    await userEvent.click(screen.getByRole("button", { name: /print or save as pdf/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(print).toHaveBeenCalled(), { timeout: 2000 });
  });

  it("reports a failed download and stays open", async () => {
    exportMarkdown.mockRejectedValue(new Error("boom"));

    await open();
    await userEvent.click(screen.getByRole("button", { name: /download as markdown/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not export/i);
    // Left open, so the user can try again without reopening it.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("tells a signed-out user to sign in again", async () => {
    exportMarkdown.mockRejectedValue(new ApiError(401, "Not authenticated"));

    await open();
    await userEvent.click(screen.getByRole("button", { name: /download as markdown/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/session has expired/i);
  });

  it("says the document is gone when it has been deleted", async () => {
    exportMarkdown.mockRejectedValue(new ApiError(404, "Not found"));

    await open();
    await userEvent.click(screen.getByRole("button", { name: /download as markdown/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer available/i);
  });
});
