import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { CreateDocumentButton } = await import("./CreateDocumentButton");

describe("CreateDocumentButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a document and refreshes the list", async () => {
    apiFetch.mockResolvedValue({ id: "doc-1", title: "Untitled document" });

    render(<CreateDocumentButton />);
    await userEvent.click(screen.getByRole("button", { name: /new document/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/v1/documents", expect.objectContaining({ method: "POST" })),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("disables the button while the request is in flight", async () => {
    let resolve: (v: unknown) => void = () => {};
    apiFetch.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<CreateDocumentButton />);
    const button = screen.getByRole("button", { name: /new document/i });
    await userEvent.click(button);

    // Without this, a double-click creates two documents.
    expect(button).toBeDisabled();
    resolve({ id: "doc-1" });
  });

  it("shows an error and re-enables the button when creation fails", async () => {
    apiFetch.mockRejectedValue(new Error("boom"));

    render(<CreateDocumentButton />);
    await userEvent.click(screen.getByRole("button", { name: /new document/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not create/i);
    expect(screen.getByRole("button", { name: /new document/i })).toBeEnabled();
  });
});
