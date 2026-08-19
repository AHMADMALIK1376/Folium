import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Folder } from "@/lib/api/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const fileDocument = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  fileDocument: (...a: unknown[]) => fileDocument(...a),
}));

const { FolderSelect } = await import("./FolderSelect");

const FOLDERS: Folder[] = [
  { id: "f1", name: "Clients", created_at: "2026-01-01T00:00:00Z", document_count: 2 },
  { id: "f2", name: "Drafts", created_at: "2026-01-01T00:00:00Z", document_count: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
  fileDocument.mockResolvedValue({});
});

describe("FolderSelect", () => {
  it("renders nothing when there is nowhere to file", () => {
    // Offering a picker whose only option is "No folder" wastes the row.
    const { container } = render(
      <FolderSelect documentId="doc-1" folderId={null} folders={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the folder the document is in", () => {
    render(<FolderSelect documentId="doc-1" folderId="f2" folders={FOLDERS} />);

    expect(screen.getByRole("combobox", { name: /folder/i })).toHaveValue("f2");
  });

  it("files the document and refreshes so the counts follow", async () => {
    render(<FolderSelect documentId="doc-1" folderId={null} folders={FOLDERS} />);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /folder/i }), "f1");

    expect(fileDocument).toHaveBeenCalledWith("doc-1", "f1");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("sends null to unfile, not an empty string", async () => {
    // The backend distinguishes "no folder" from "leave the folder alone", and
    // an empty string is neither.
    render(<FolderSelect documentId="doc-1" folderId="f1" folders={FOLDERS} />);

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /folder/i }),
      "No folder",
    );

    expect(fileDocument).toHaveBeenCalledWith("doc-1", null);
  });

  it("puts the document back where it was when the move fails", async () => {
    // The select is optimistic. A failure that left it showing the new folder
    // would be a lie about where the document is.
    fileDocument.mockRejectedValue(new Error("offline"));

    render(<FolderSelect documentId="doc-1" folderId="f1" folders={FOLDERS} />);
    const select = screen.getByRole("combobox", { name: /folder/i });

    await userEvent.selectOptions(select, "f2");

    await waitFor(() => expect(select).toHaveValue("f1"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
