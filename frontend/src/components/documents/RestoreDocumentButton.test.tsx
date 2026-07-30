import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { RestoreDocumentButton } = await import("./RestoreDocumentButton");

const doc = {
  id: "doc-9",
  title: "Recovered",
  owner_id: "u1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("RestoreDocumentButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores the document and refreshes", async () => {
    apiFetch.mockResolvedValue({ id: "doc-9" });

    render(<RestoreDocumentButton document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/v1/documents/doc-9/restore",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("disables the button while restoring", async () => {
    let resolve: (v: unknown) => void = () => {};
    apiFetch.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<RestoreDocumentButton document={doc} />);
    const button = screen.getByRole("button", { name: /restore/i });
    await userEvent.click(button);

    expect(button).toBeDisabled();

    // Settle inside act() so the post-resolve state update is flushed here
    // rather than leaking a warning into whichever test runs next.
    await act(async () => {
      resolve({});
    });
  });

  it("shows an error when restoring fails", async () => {
    apiFetch.mockRejectedValue(new Error("boom"));

    render(<RestoreDocumentButton document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not restore/i);
  });

  it("tells the user to sign in again when the session has expired", async () => {
    // Retrying a 401 fails forever, so the message has to offer the only action
    // that actually recovers.
    apiFetch.mockRejectedValue(new ApiError(401, "Not authenticated"));

    render(<RestoreDocumentButton document={doc} />);
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/session has expired/i);
    expect(alert).not.toHaveTextContent(/could not restore/i);
  });
});
