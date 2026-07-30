import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { DeleteDocumentDialog } = await import("./DeleteDocumentDialog");

const doc = {
  id: "doc-1",
  title: "Quarterly plan",
  owner_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("DeleteDocumentDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not delete until the user confirms", async () => {
    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("names the document so the wrong one is not deleted", async () => {
    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(/quarterly plan/i);
  });

  it("says the document can be restored, because it can", async () => {
    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/trash/i);
    // Deleting is reversible here. Claiming otherwise would make people
    // hesitate over an action they can undo.
    expect(dialog).not.toHaveTextContent(/cannot be undone|permanent/i);
  });

  it("deletes and refreshes once confirmed", async () => {
    apiFetch.mockResolvedValue(null);

    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(await screen.findByRole("button", { name: /move to trash/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/v1/documents/doc-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("treats an already-deleted document as success", async () => {
    const { ApiError } = await import("@/lib/api/errors");
    apiFetch.mockRejectedValue(new ApiError(404, "Document not found"));

    render(<DeleteDocumentDialog document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(await screen.findByRole("button", { name: /move to trash/i }));

    // The user's intent is satisfied. Surfacing an error for "it was already
    // gone" is noise.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
