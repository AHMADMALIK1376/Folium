import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

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

    // Settle inside act() so the post-resolve state update is flushed here
    // rather than leaking a warning into whichever test runs next.
    await act(async () => {
      resolve({ id: "doc-1" });
    });
  });

  it("shows an error and re-enables the button when creation fails", async () => {
    apiFetch.mockRejectedValue(new Error("boom"));

    render(<CreateDocumentButton />);
    await userEvent.click(screen.getByRole("button", { name: /new document/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not create/i);
    expect(screen.getByRole("button", { name: /new document/i })).toBeEnabled();
  });

  it("tells the user to sign in again when the session has expired", async () => {
    // A generic "try again" is wrong here: retrying a 401 fails forever, so the
    // message has to offer the only action that actually recovers.
    apiFetch.mockRejectedValue(new ApiError(401, "Not authenticated"));

    render(<CreateDocumentButton />);
    await userEvent.click(screen.getByRole("button", { name: /new document/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/session has expired/i);
    expect(alert).not.toHaveTextContent(/could not create/i);
    expect(screen.getByRole("link", { name: /sign in again/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("distinguishes an outage from a rejected session", async () => {
    apiFetch.mockRejectedValue(new ApiError(503, "Signing keys unavailable"));

    render(<CreateDocumentButton />);
    await userEvent.click(screen.getByRole("button", { name: /new document/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(alert).not.toHaveTextContent(/session has expired/i);
  });
});
