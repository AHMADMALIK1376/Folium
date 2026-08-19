import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { DocumentDetail, Permission } from "@/lib/api/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const updateDocument = vi.fn();
const listAttachments = vi.fn();
const listComments = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  updateDocument: (...args: unknown[]) => updateDocument(...args),
  // The attachments panel reaches for these from the same module. Stubbed so a
  // document with attachments enabled renders rather than throwing on an
  // undefined import.
  listAttachments: (...args: unknown[]) => listAttachments(...args),
  uploadAttachment: vi.fn(),
  attachmentUrl: vi.fn(),
  deleteAttachment: vi.fn(),
  // Likewise for the comments panel, which is rendered at every permission
  // level. Its own behaviour is covered in CommentsPanel.test.tsx.
  listComments: (...args: unknown[]) => listComments(...args),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));

/** ProseMirror needs DOM APIs jsdom does not have, and a test driving a mocked
 *  ProseMirror would prove nothing about editing anyway — Playwright covers the
 *  real editor in a real browser. What is worth testing here is everything
 *  around it: permissions, the title, and how a failed save reads. */
const collabState = {
  enabled: false,
  provider: null as unknown,
  doc: null as unknown,
  loading: false,
  canWrite: false,
  user: null as unknown,
};
vi.mock("@/lib/collab/useCollaboration", () => ({
  useCollaboration: () => collabState,
}));

/** The options the editor was built with, so the extension list and the content
 *  seeding can be asserted without a real ProseMirror. */
let editorOptions: Record<string, unknown> = {};

const setEditable = vi.fn();
vi.mock("@tiptap/react", () => ({
  useEditor: (options: { editable: boolean }) => ((editorOptions = options), {
    isActive: () => false,
    // FormattingControls reads the current colour and font from here; a mock
    // without it throws and takes every test in this file down with it.
    getAttributes: () => ({}),
    setEditable,
    getJSON: () => ({ type: "doc", content: [] }),
    chain: () => ({
      focus: () => ({
        toggleBold: () => ({ run: vi.fn() }),
        toggleItalic: () => ({ run: vi.fn() }),
        toggleUnderline: () => ({ run: vi.fn() }),
        toggleHeading: () => ({ run: vi.fn() }),
        setParagraph: () => ({ run: vi.fn() }),
        toggleBulletList: () => ({ run: vi.fn() }),
        toggleOrderedList: () => ({ run: vi.fn() }),
      }),
    }),
    isEditable: options.editable,
    isEmpty: true,
    commands: { setContent: vi.fn() },
    // The comments panel subscribes to selection changes through these and
    // dispatches its anchors through the view. A real editor always has one —
    // TipTap builds it in the Editor constructor — so the mock has one too,
    // rather than making the component tolerate a state that cannot occur.
    on: vi.fn(),
    off: vi.fn(),
    isDestroyed: false,
    view: { dispatch: vi.fn() },
    state: {
      tr: { setMeta: () => ({}) },
      selection: { from: 0, to: 0 },
      doc: { descendants: () => {} },
    },
  }),
  EditorContent: () => <div data-testid="editor-content" />,
}));

const { DocumentEditor } = await import("./DocumentEditor");

function makeDocument(
  permission: Permission,
  attachmentsEnabled = false,
): DocumentDetail {
  return {
    id: "doc-1",
    title: "Quarterly plan",
    owner_id: "u1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    content: { type: "doc", content: [] },
    permission,
    // Off by default here, so these tests describe the editor rather than the
    // attachments panel. One test below turns it on.
    attachments_enabled: attachmentsEnabled,
    owner: {
      id: "u1",
      email: "owner@example.com",
      display_name: "Owner",
      avatar_url: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

describe("DocumentEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The comments panel mounts at every permission level.
    listComments.mockResolvedValue([]);
  });

  it("gives an owner a toolbar and an editable title", () => {
    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(screen.getByRole("button", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /document title/i })).toBeInTheDocument();
  });

  it("gives an editor the same controls as an owner", () => {
    render(<DocumentEditor document={makeDocument("edit")} />);

    expect(screen.getByRole("button", { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /document title/i })).toBeInTheDocument();
  });

  it("offers a view-only user no way to edit", () => {
    // The backend 404s a PATCH from a non-editor, so a toolbar here could only
    // ever produce an error the user cannot act on.
    render(<DocumentEditor document={makeDocument("view")} />);

    expect(screen.queryByRole("button", { name: /bold/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /document title/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    // Two copies of the title exist: the one on screen, and a print-only
    // heading, because printing hides the whole header row.
    expect(screen.getAllByText(/quarterly plan/i).length).toBeGreaterThan(0);
  });

  it("tells a commenter what they can do, rather than calling it read-only", () => {
    // `comment` is not editing and it is not viewing. Since Phase 14 it is a
    // level with something to do, and the banner has to say which.
    render(<DocumentEditor document={makeDocument("comment")} />);

    expect(screen.queryByRole("button", { name: /bold/i })).not.toBeInTheDocument();
    expect(screen.getByText(/shared this with you for commenting/i)).toBeInTheDocument();
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument();
  });

  it("still calls a view-only document read-only", () => {
    render(<DocumentEditor document={makeDocument("view")} />);

    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("starts out saying the document is saved", () => {
    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  });

  it("saves a renamed title", async () => {
    updateDocument.mockResolvedValue(makeDocument("owner"));

    render(<DocumentEditor document={makeDocument("owner")} />);
    const title = screen.getByRole("textbox", { name: /document title/i });
    await userEvent.clear(title);
    await userEvent.type(title, "Renamed");

    await waitFor(
      () =>
        expect(updateDocument).toHaveBeenCalledWith(
          "doc-1",
          expect.objectContaining({ title: "Renamed" }),
          undefined,
        ),
      { timeout: 3000 },
    );
  });

  it("never sends a blank title, and restores the last one on blur", async () => {
    // The backend rejects a blank title with a 422, so sending one produces an
    // error for something the UI can simply decline to do.
    render(<DocumentEditor document={makeDocument("owner")} />);
    const title = screen.getByRole("textbox", { name: /document title/i });
    await userEvent.clear(title);
    await userEvent.tab();

    expect(title).toHaveValue("Quarterly plan");
    await waitFor(() => expect(updateDocument).not.toHaveBeenCalled(), { timeout: 1500 });
  });

  it("says so when a save fails, and does not claim to be saved", async () => {
    updateDocument.mockRejectedValue(new Error("boom"));

    render(<DocumentEditor document={makeDocument("owner")} />);
    await userEvent.type(
      screen.getByRole("textbox", { name: /document title/i }),
      "!",
    );

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent(/could not save/i);
    expect(screen.getByRole("status")).not.toHaveTextContent(/^saved$/i);
  });

  it("tells a signed-out user to sign in again rather than to retry", async () => {
    updateDocument.mockRejectedValue(new ApiError(401, "Not authenticated"));

    render(<DocumentEditor document={makeDocument("owner")} />);
    await userEvent.type(
      screen.getByRole("textbox", { name: /document title/i }),
      "!",
    );

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent(/session has expired/i);
  });

  it("announces save status changes to a screen reader", () => {
    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});

/** Names of the extensions the editor was configured with. */
function extensionNames() {
  return ((editorOptions.extensions as { name?: string }[]) ?? []).map(
    (extension) => extension?.name,
  );
}

describe("DocumentEditor with collaboration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listComments.mockResolvedValue([]);
    editorOptions = {};
    Object.assign(collabState, {
      enabled: false,
      provider: null,
      doc: null,
      loading: false,
      canWrite: false,
      user: null,
    });
  });

  it("edits alone when no collaboration server is configured", () => {
    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(extensionNames()).not.toContain("collaboration");
    // Seeded from props, because there is no shared document to seed from.
    expect(editorOptions.content).toBeTruthy();
  });

  it("does not seed from props when the room owns the content", () => {
    // Seeding here as well as from the room inserts the document twice, which
    // is the failure this whole mechanic exists to avoid.
    Object.assign(collabState, {
      enabled: true,
      doc: {},
      provider: { on: vi.fn(), off: vi.fn() },
      canWrite: true,
    });

    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(editorOptions.content).toBeUndefined();
  });

  it("adds collaboration and cursors when connected", () => {
    Object.assign(collabState, {
      enabled: true,
      doc: {},
      provider: { on: vi.fn(), off: vi.fn() },
      canWrite: true,
    });

    render(<DocumentEditor document={makeDocument("owner")} />);

    const names = extensionNames();
    expect(names).toContain("collaboration");
    expect(names).toContain("collaborationCursor");
  });

  it("waits for the provider to sync before seeding an empty room", () => {
    // Before sync every client's document looks empty, so seeding on mount
    // would insert the text once per connected client.
    const on = vi.fn();
    Object.assign(collabState, {
      enabled: true,
      doc: {},
      provider: { on, off: vi.fn() },
      canWrite: true,
    });

    render(<DocumentEditor document={makeDocument("owner")} />);

    expect(on).toHaveBeenCalledWith("synced", expect.any(Function));
  });

  it("never seeds on behalf of a read-only user", () => {
    const on = vi.fn();
    Object.assign(collabState, {
      enabled: true,
      doc: {},
      provider: { on, off: vi.fn() },
      canWrite: false,
    });

    render(<DocumentEditor document={makeDocument("view")} />);

    expect(on).not.toHaveBeenCalled();
  });
});

describe("cursor identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listComments.mockResolvedValue([]);
    editorOptions = {};
  });

  it("labels the caret with the signed-in user, not the document owner", () => {
    // The bug this replaces: the editor only had the document's owner to hand,
    // so on a shared document every participant's cursor carried the owner's
    // name. Deliberately tested with a collaborator on someone else's document.
    Object.assign(collabState, {
      enabled: true,
      doc: {},
      provider: { on: vi.fn(), off: vi.fn() },
      canWrite: true,
      loading: false,
      user: { id: "u2", email: "guest@example.com", display_name: "Guest Chen" },
    });

    render(<DocumentEditor document={makeDocument("edit")} />);

    const cursor = (editorOptions.extensions as { name?: string; options?: Record<string, unknown> }[])
      .find((extension) => extension?.name === "collaborationCursor");
    const user = cursor?.options?.user as { name: string; color: string };

    expect(user.name).toBe("Guest Chen");
    // The owner of makeDocument() is "Owner"; seeing that here is the old bug.
    expect(user.name).not.toBe("Owner");
    expect(user.color).toBeTruthy();
  });

  it("omits the attachments panel when the deployment cannot store files", () => {
    // Absent, not an empty state and not an error: a deployment without a
    // storage key is unconfigured, not broken.
    render(<DocumentEditor document={makeDocument("edit", false)} />);

    expect(screen.queryByRole("heading", { name: /attachments/i })).not.toBeInTheDocument();
    expect(listAttachments).not.toHaveBeenCalled();
  });

  it("shows the attachments panel when the deployment can store files", async () => {
    listAttachments.mockResolvedValue([]);

    render(<DocumentEditor document={makeDocument("edit", true)} />);

    expect(
      await screen.findByRole("heading", { name: /attachments/i }),
    ).toBeInTheDocument();
  });
});
