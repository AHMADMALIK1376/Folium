import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { CommentThread } from "@/lib/api/types";

const listComments = vi.fn();
const createComment = vi.fn();
const updateComment = vi.fn();
const deleteComment = vi.fn();
vi.mock("@/lib/api/documents", () => ({
  listComments: (...a: unknown[]) => listComments(...a),
  createComment: (...a: unknown[]) => createComment(...a),
  updateComment: (...a: unknown[]) => updateComment(...a),
  deleteComment: (...a: unknown[]) => deleteComment(...a),
}));

const { CommentsPanel } = await import("./CommentsPanel");

function thread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: "c1",
    document_id: "doc-1",
    parent_id: null,
    body: "Is this right?",
    quote: null,
    prefix: null,
    suffix: null,
    author_id: "u1",
    author_name: "Alice",
    resolved_at: null,
    resolved_by: null,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    replies: [],
    ...overrides,
  };
}

function panel(props: Partial<Parameters<typeof CommentsPanel>[0]> = {}) {
  return render(
    <CommentsPanel
      documentId="doc-1"
      permission="owner"
      currentUserId="u1"
      // Null throughout: the editor is TipTap's, and every behaviour here that
      // needs one — highlighting, scrolling to a passage — is the anchor
      // module's job and is tested there against a real ProseMirror document.
      editor={null}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listComments.mockResolvedValue([]);
  createComment.mockResolvedValue(thread());
  updateComment.mockResolvedValue(thread());
  deleteComment.mockResolvedValue(undefined);
});

describe("CommentsPanel", () => {
  it("says what the panel is for rather than showing a blank", async () => {
    panel();

    expect(await screen.findByText(/select a passage and comment on it/i)).toBeInTheDocument();
  });

  it("gives a viewer no way to write, and still shows them the discussion", async () => {
    // The point of three permission levels. The backend refuses a viewer's POST
    // regardless; this stops the interface promising otherwise.
    listComments.mockResolvedValue([thread({ body: "Worth reading" })]);

    panel({ permission: "view" });

    expect(await screen.findByText("Worth reading")).toBeInTheDocument();
    expect(screen.queryByLabelText(/write a comment/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^resolve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reply$/i })).not.toBeInTheDocument();
  });

  it("lets a commenter write, resolve and reply", async () => {
    listComments.mockResolvedValue([thread()]);

    panel({ permission: "comment", currentUserId: "u2" });

    expect(await screen.findByLabelText(/write a comment/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reply$/i })).toBeInTheDocument();
  });

  it("posts a comment on the whole document when nothing is selected", async () => {
    panel();

    await userEvent.type(await screen.findByLabelText(/write a comment/i), "A note");
    await userEvent.click(screen.getByRole("button", { name: /^comment$/i }));

    expect(createComment).toHaveBeenCalledWith("doc-1", {
      body: "A note",
      quote: null,
      prefix: null,
      suffix: null,
    });
  });

  it("will not post an empty comment", async () => {
    panel();

    await userEvent.type(await screen.findByLabelText(/write a comment/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /^comment$/i }));

    expect(createComment).not.toHaveBeenCalled();
  });

  it("replies to a thread rather than starting a new one", async () => {
    listComments.mockResolvedValue([thread()]);

    panel();
    await userEvent.click(await screen.findByRole("button", { name: /^reply$/i }));
    await userEvent.type(screen.getByLabelText(/write a reply/i), "Yes");
    await userEvent.click(screen.getByRole("button", { name: /^reply$/i }));

    expect(createComment).toHaveBeenCalledWith("doc-1", { body: "Yes", parent_id: "c1" });
  });

  it("shows replies under their thread", async () => {
    listComments.mockResolvedValue([
      thread({
        replies: [
          { ...thread({ id: "c2", body: "Agreed" }), parent_id: "c1", replies: undefined } as never,
        ],
      }),
    ]);

    panel();

    expect(await screen.findByText("Agreed")).toBeInTheDocument();
  });

  it("offers no Reply on a reply", async () => {
    // Replies go one level deep. Offering a control the backend refuses would
    // be a promise the API does not keep.
    listComments.mockResolvedValue([
      thread({
        replies: [
          { ...thread({ id: "c2", body: "Agreed" }), parent_id: "c1", replies: undefined } as never,
        ],
      }),
    ]);

    panel();
    await screen.findByText("Agreed");

    expect(screen.getAllByRole("button", { name: /^reply$/i })).toHaveLength(1);
  });

  it("resolves a thread", async () => {
    listComments.mockResolvedValue([thread()]);

    panel();
    await userEvent.click(await screen.findByRole("button", { name: /^resolve$/i }));

    expect(updateComment).toHaveBeenCalledWith("doc-1", "c1", { resolved: true });
  });

  it("reopens a resolved thread with false, not an omitted key", async () => {
    // The distinction the API is built around: an absent key means "leave it
    // alone", so reopening has to be expressible as an explicit false.
    listComments.mockResolvedValue([thread({ resolved_at: "2026-08-20T11:00:00Z" })]);

    panel();
    await userEvent.click(await screen.findByRole("button", { name: /show 1 resolved/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^reopen$/i }));

    expect(updateComment).toHaveBeenCalledWith("doc-1", "c1", { resolved: false });
  });

  it("keeps resolved threads, collapsed behind a count", async () => {
    // A resolved thread is a record of a decision, not rubbish.
    listComments.mockResolvedValue([
      thread({ resolved_at: "2026-08-20T11:00:00Z", body: "Settled" }),
    ]);

    panel();

    expect(await screen.findByRole("button", { name: /show 1 resolved/i })).toBeInTheDocument();
    expect(screen.queryByText("Settled")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /show 1 resolved/i }));
    expect(screen.getByText("Settled")).toBeInTheDocument();
  });

  it("lets the author edit their own comment", async () => {
    listComments.mockResolvedValue([thread({ author_id: "u1" })]);

    panel({ currentUserId: "u1" });
    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    const field = screen.getByLabelText(/edit comment/i);
    await userEvent.clear(field);
    await userEvent.type(field, "Rephrased");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updateComment).toHaveBeenCalledWith("doc-1", "c1", { body: "Rephrased" });
  });

  it("lets the owner delete someone else's comment but never edit it", async () => {
    // Deleting is moderation — it is their document. Editing someone's words
    // while their name stays on them is forgery.
    listComments.mockResolvedValue([thread({ author_id: "someone-else" })]);

    panel({ permission: "owner", currentUserId: "u1" });
    await screen.findByText("Is this right?");

    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("gives a commenter no delete on someone else's comment", async () => {
    listComments.mockResolvedValue([thread({ author_id: "someone-else" })]);

    panel({ permission: "comment", currentUserId: "u1" });
    await screen.findByText("Is this right?");

    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("names a deleted author rather than dropping their comment", async () => {
    // author_id is ON DELETE SET NULL: a discussion outlives the account that
    // took part in it.
    listComments.mockResolvedValue([thread({ author_id: null, author_name: null })]);

    panel();

    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Is this right?")).toBeInTheDocument();
  });

  it("shows the quoted passage on an anchored comment", async () => {
    listComments.mockResolvedValue([thread({ quote: "the budget constraint" })]);

    panel();

    expect(await screen.findByText(/the budget constraint/)).toBeInTheDocument();
  });

  it("does not dispatch into a torn-down editor", async () => {
    // The lifecycle trap, pinned. TipTap builds the view in the Editor
    // constructor, so an editor never exists without one — but `destroy()`
    // destroys the view and *leaves `editor.view` set*, so a truthiness check
    // sails straight past a torn-down editor and throws. `isDestroyed` reads
    // `!view?.docView`, which is the check that actually holds.
    const dispatch = vi.fn();
    const destroyed = {
      isDestroyed: true,
      view: { dispatch },
      // Walkable, because a quoted thread asks the document whether its
      // passage is still there.
      state: {
        tr: { setMeta: () => ({}) },
        selection: { from: 0, to: 0 },
        doc: { descendants: () => {} },
      },
      on: vi.fn(),
      off: vi.fn(),
    };
    listComments.mockResolvedValue([thread({ quote: "something" })]);

    panel({ editor: destroyed as never });

    expect(await screen.findByText("Is this right?")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches its anchors into a live editor", async () => {
    const dispatch = vi.fn();
    const live = {
      isDestroyed: false,
      view: { dispatch },
      // Walkable, because a quoted thread asks the document whether its
      // passage is still there.
      state: {
        tr: { setMeta: () => ({}) },
        selection: { from: 0, to: 0 },
        doc: { descendants: () => {} },
      },
      on: vi.fn(),
      off: vi.fn(),
    };
    listComments.mockResolvedValue([thread({ quote: "something" })]);

    panel({ editor: live as never });

    await waitFor(() => expect(dispatch).toHaveBeenCalled());
  });

  it("reports a failure to load rather than looking empty", async () => {
    listComments.mockRejectedValue(new ApiError(500, "boom"));

    panel();

    await waitFor(() =>
      expect(screen.getByText(/could not load the comments/i)).toBeInTheDocument(),
    );
  });
});
