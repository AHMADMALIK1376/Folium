import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";

const listAttachments = vi.fn();
const uploadAttachment = vi.fn();
const attachmentUrl = vi.fn();
const deleteAttachment = vi.fn();

vi.mock("@/lib/api/documents", () => ({
  listAttachments: (...a: unknown[]) => listAttachments(...a),
  uploadAttachment: (...a: unknown[]) => uploadAttachment(...a),
  attachmentUrl: (...a: unknown[]) => attachmentUrl(...a),
  deleteAttachment: (...a: unknown[]) => deleteAttachment(...a),
}));

const { AttachmentsPanel, formatSize } = await import("./AttachmentsPanel");

const photo = {
  id: "att-1",
  document_id: "doc-1",
  filename: "photo.png",
  mime_type: "image/png",
  size_bytes: 2048,
  created_at: "2026-08-15T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  listAttachments.mockResolvedValue([photo]);
  vi.stubGlobal("open", vi.fn());
});

function pngFile(name = "new.png", size = 10) {
  return new File([new Uint8Array(size)], name, { type: "image/png" });
}

describe("AttachmentsPanel", () => {
  it("lists what is attached, with its size", async () => {
    render(<AttachmentsPanel documentId="doc-1" canEdit />);

    expect(await screen.findByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
  });

  it("says so plainly when nothing is attached", async () => {
    listAttachments.mockResolvedValue([]);

    render(<AttachmentsPanel documentId="doc-1" canEdit />);

    expect(await screen.findByText(/nothing attached yet/i)).toBeInTheDocument();
  });

  it("uploads a picked file and shows it without a reload", async () => {
    uploadAttachment.mockResolvedValue({ ...photo, id: "att-2", filename: "new.png" });

    render(<AttachmentsPanel documentId="doc-1" canEdit />);
    await screen.findByText("photo.png");

    await userEvent.upload(screen.getByTestId("attachment-input"), pngFile());

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalled());
    expect(await screen.findByText("new.png")).toBeInTheDocument();
  });

  it("refuses a disallowed type without calling the API", async () => {
    render(<AttachmentsPanel documentId="doc-1" canEdit />);
    await screen.findByText("photo.png");

    // applyAccept: false on purpose. The input's `accept` attribute would stop
    // this before the handler ran — which is the common path, and is why the
    // attribute is there — but `accept` only filters the picker's default view.
    // A user can switch it to "All files", and drag-and-drop ignores it
    // entirely, so the check in code is the one being tested here.
    await userEvent.upload(
      screen.getByTestId("attachment-input"),
      new File(["MZ"], "payload.exe", { type: "application/octet-stream" }),
      { applyAccept: false },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/not a file type/i);
    // The backend refuses it too; this just avoids a doomed request.
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("refuses a file over the limit without calling the API", async () => {
    render(<AttachmentsPanel documentId="doc-1" canEdit />);
    await screen.findByText("photo.png");

    await userEvent.upload(
      screen.getByTestId("attachment-input"),
      pngFile("huge.png", 10 * 1024 * 1024 + 1),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/10MB/i);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("reports a failed upload and leaves the list intact", async () => {
    uploadAttachment.mockRejectedValue(new ApiError(503, "unavailable"));

    render(<AttachmentsPanel documentId="doc-1" canEdit />);
    await screen.findByText("photo.png");

    await userEvent.upload(screen.getByTestId("attachment-input"), pngFile());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("fetches a fresh URL per download rather than reusing one", async () => {
    // Signed URLs expire; one minted at load would be dead by the time it is used.
    attachmentUrl.mockResolvedValue({ url: "https://storage.test/x", expires_in: 300 });

    render(<AttachmentsPanel documentId="doc-1" canEdit />);
    await screen.findByText("photo.png");

    await userEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => expect(attachmentUrl).toHaveBeenCalledWith("doc-1", "att-1"));
  });

  it("removes an attachment from the list once deleted", async () => {
    deleteAttachment.mockResolvedValue(undefined);

    render(<AttachmentsPanel documentId="doc-1" canEdit />);
    await screen.findByText("photo.png");

    await userEvent.click(screen.getByRole("button", { name: /remove photo\.png/i }));

    await waitFor(() => expect(screen.queryByText("photo.png")).not.toBeInTheDocument());
  });

  it("offers a viewer downloads but no upload or remove", async () => {
    render(<AttachmentsPanel documentId="doc-1" canEdit={false} />);

    const list = await screen.findByRole("list");
    expect(within(list).getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /attach a file/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("reports a failed load", async () => {
    listAttachments.mockRejectedValue(new ApiError(503, "unavailable"));

    render(<AttachmentsPanel documentId="doc-1" canEdit />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("formatSize", () => {
  it("scales the unit to the size", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
