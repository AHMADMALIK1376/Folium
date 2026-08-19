import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { Folder } from "@/lib/api/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const createFolder = vi.fn();
const renameFolder = vi.fn();
const deleteFolder = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  createFolder: (...a: unknown[]) => createFolder(...a),
  renameFolder: (...a: unknown[]) => renameFolder(...a),
  deleteFolder: (...a: unknown[]) => deleteFolder(...a),
}));

const { ManageFoldersDialog } = await import("./ManageFoldersDialog");

const CLIENTS: Folder = {
  id: "f1",
  name: "Clients",
  created_at: "2026-01-01T00:00:00Z",
  document_count: 2,
};

async function open(folders: Folder[] = []) {
  render(<ManageFoldersDialog folders={folders} />);
  await userEvent.click(screen.getByRole("button", { name: /manage folders/i }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  createFolder.mockResolvedValue(CLIENTS);
  renameFolder.mockResolvedValue(CLIENTS);
  deleteFolder.mockResolvedValue(undefined);
});

describe("ManageFoldersDialog", () => {
  it("says that filing does not change who can read a document", async () => {
    // The one thing someone must not have to guess about a folder.
    const dialog = await open();

    expect(dialog).toHaveTextContent(/do not change who can read/i);
  });

  it("says that deleting a folder keeps its documents", async () => {
    const dialog = await open();

    expect(dialog).toHaveTextContent(/keeps its documents/i);
  });

  it("creates a folder and clears the field for the next one", async () => {
    await open();
    const field = screen.getByLabelText(/new folder name/i);

    await userEvent.type(field, "  Client work  ");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    // Trimmed here as well as on the server, so the field does not appear to
    // accept a name the server then rewrites.
    expect(createFolder).toHaveBeenCalledWith("Client work");
    await waitFor(() => expect(field).toHaveValue(""));
    expect(refresh).toHaveBeenCalled();
  });

  it("will not submit a blank name", async () => {
    await open();

    await userEvent.type(screen.getByLabelText(/new folder name/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(createFolder).not.toHaveBeenCalled();
  });

  it("shows what the server says when the name is taken", async () => {
    // "You already have a folder with that name" beats anything written here,
    // because it names what is wrong.
    createFolder.mockRejectedValue(
      new ApiError(422, "You already have a folder with that name"),
    );

    await open();
    await userEvent.type(screen.getByLabelText(/new folder name/i), "Clients");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText(/already have a folder with that name/i),
    ).toBeInTheDocument();
  });

  it("renames a folder", async () => {
    await open([CLIENTS]);

    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const field = screen.getByLabelText(/rename clients/i);
    await userEvent.clear(field);
    await userEvent.type(field, "Client work");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(renameFolder).toHaveBeenCalledWith("f1", "Client work");
  });

  it("does not call the API when a rename changes nothing", async () => {
    await open([CLIENTS]);

    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(renameFolder).not.toHaveBeenCalled();
  });

  it("asks before deleting", async () => {
    // One click away from destroying an organisation someone built by hand.
    await open([CLIENTS]);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteFolder).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteFolder).toHaveBeenCalledWith("f1");
  });

  it("lets a confirmation be backed out of", async () => {
    await open([CLIENTS]);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(deleteFolder).not.toHaveBeenCalled();
  });

  it("counts what is in each folder", async () => {
    const dialog = await open([CLIENTS]);

    expect(dialog).toHaveTextContent("2 documents");
  });
});
