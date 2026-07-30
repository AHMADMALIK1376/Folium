import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const importDocument = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  importDocument: (...a: unknown[]) => importDocument(...a),
}));

const { ImportDocumentButton, MAX_IMPORT_BYTES } = await import(
  "./ImportDocumentButton"
);

/** The file input is hidden behind a styled label, so it is addressed by its
 *  accessible name rather than by role. */
function fileInput() {
  return screen.getByLabelText(/import/i) as HTMLInputElement;
}

function makeFile(name: string, bytes = 10, type = "text/markdown") {
  return new File(["x".repeat(bytes)], name, { type });
}

describe("ImportDocumentButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uploads the chosen file and opens the new document", async () => {
    importDocument.mockResolvedValue({ id: "doc-7", title: "notes" });

    render(<ImportDocumentButton />);
    await userEvent.upload(fileInput(), makeFile("notes.md"));

    await waitFor(() => expect(importDocument).toHaveBeenCalledTimes(1));
    // An imported file is something you want to look at, unlike a blank new
    // document, which leaves you on the dashboard.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/documents/doc-7"));
  });

  it("refuses a file type the backend would reject anyway", async () => {
    render(<ImportDocumentButton />);

    // applyAccept: false reproduces the real hole this check exists for. The
    // input's accept attribute only filters the picker's default view, and every
    // major browser lets the user switch to "All files" and choose anything —
    // so a .pdf genuinely can arrive here. userEvent honours accept by default,
    // which would make this test pass without the component doing anything.
    await userEvent.upload(
      fileInput(),
      makeFile("report.pdf", 10, "application/pdf"),
      { applyAccept: false },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/\.txt.*\.md|\.md.*\.txt/i);
    expect(importDocument).not.toHaveBeenCalled();
  });

  it("refuses an oversized file before uploading it", async () => {
    render(<ImportDocumentButton />);
    await userEvent.upload(fileInput(), makeFile("big.md", MAX_IMPORT_BYTES + 1));

    expect(await screen.findByRole("alert")).toHaveTextContent(/2 ?MB/i);
    expect(importDocument).not.toHaveBeenCalled();
  });

  it("accepts an uppercase extension", async () => {
    // Case-sensitive matching would reject NOTES.MD, which the backend accepts.
    importDocument.mockResolvedValue({ id: "doc-8" });

    render(<ImportDocumentButton />);
    await userEvent.upload(fileInput(), makeFile("NOTES.MD"));

    await waitFor(() => expect(importDocument).toHaveBeenCalledTimes(1));
  });

  it("accepts .txt and .markdown as well", async () => {
    importDocument.mockResolvedValue({ id: "doc-9" });

    render(<ImportDocumentButton />);
    await userEvent.upload(fileInput(), makeFile("a.txt", 10, "text/plain"));
    await waitFor(() => expect(importDocument).toHaveBeenCalledTimes(1));

    await userEvent.upload(fileInput(), makeFile("b.markdown"));
    await waitFor(() => expect(importDocument).toHaveBeenCalledTimes(2));
  });

  it("reports a failed upload and stays usable", async () => {
    importDocument.mockRejectedValue(new Error("boom"));

    render(<ImportDocumentButton />);
    await userEvent.upload(fileInput(), makeFile("notes.md"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not import/i);
    expect(fileInput()).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("tells a signed-out user to sign in again", async () => {
    importDocument.mockRejectedValue(new ApiError(401, "Not authenticated"));

    render(<ImportDocumentButton />);
    await userEvent.upload(fileInput(), makeFile("notes.md"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/session has expired/i);
  });

  it("shows the backend's reason when it rejects the file", async () => {
    // The server's 422 wording is specific: "File must be UTF-8 encoded text"
    // beats a generic failure the user cannot act on.
    importDocument.mockRejectedValue(
      new ApiError(422, "File must be UTF-8 encoded text"),
    );

    render(<ImportDocumentButton />);
    await userEvent.upload(fileInput(), makeFile("notes.md"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/utf-8/i);
  });

  it("disables the input while uploading", async () => {
    let release: (v: unknown) => void = () => {};
    importDocument.mockReturnValue(new Promise((r) => (release = r)));

    render(<ImportDocumentButton />);
    await userEvent.upload(fileInput(), makeFile("notes.md"));

    await waitFor(() => expect(fileInput()).toBeDisabled());
    release({ id: "doc-1" });
  });
});
