"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import {
  createComment,
  deleteComment,
  listComments,
  listShares,
  updateComment,
} from "@/lib/api/documents";
import type { Comment, CommentThread, Permission, UserProfile } from "@/lib/api/types";
import { describeSelection, locate, type Anchor } from "@/lib/editor/anchors";
import {
  SET_COMMENT_ANCHORS,
  type CommentAnchor,
} from "@/lib/editor/commentHighlights";
import { MentionField, mentionedIn, type Mentionable } from "./MentionField";

import { cn } from "@/lib/utils";

/** Who may write here.
 *
 * Mirrors the backend's `can_comment`, which is the boundary that counts — a
 * POST from a viewer gets a 403 whatever this returns. Edit implies comment:
 * someone trusted to change the words is not thereby forbidden from discussing
 * them. */
function canComment(permission: Permission) {
  return permission === "owner" || permission === "edit" || permission === "comment";
}

function when(iso: string) {
  return new Date(iso).toLocaleString();
}

/** The discussion about a document.
 *
 * A panel rather than a dialog, for the reason attachments are: a discussion is
 * part of reading a document, not an action performed on it.
 */
export function CommentsPanel({
  documentId,
  permission,
  currentUserId,
  editor,
  owner,
  openComment,
  onOpenedComment,
}: {
  documentId: string;
  permission: Permission;
  currentUserId: string | null;
  editor: Editor | null;
  /** The document's owner, who is mentionable and is not in the share list. */
  owner?: UserProfile;
  /** A thread the reader asked for by clicking its highlight in the document. */
  openComment?: string | null;
  onOpenedComment?: () => void;
}) {
  const [threads, setThreads] = useState<CommentThread[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selection, setSelection] = useState<Anchor | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [people, setPeople] = useState<Mentionable[]>([]);
  const writable = canComment(permission);

  const load = useCallback(async () => {
    try {
      setThreads(await listComments(documentId));
    } catch (e) {
      setError(e);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Who can be addressed: the owner plus everyone the document is shared with,
  // minus yourself. Only for people who can actually write, so a viewer does
  // not pay a request for a picker they will never see.
  const loadPeople = useCallback(async () => {
    if (!writable) return;

    try {
      const shares = await listShares(documentId);
      const all: Mentionable[] = [
        ...(owner ? [{ id: owner.id, display_name: owner.display_name }] : []),
        ...shares.map((s) => ({ id: s.user_id, display_name: s.display_name })),
      ];
      setPeople(all.filter((person) => person.id !== currentUserId));
    } catch {
      // A picker that cannot be populated simply does not appear. Commenting
      // still works, which is the part that matters.
    }
  }, [documentId, writable, owner, currentUserId]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  // Hold the last passage the reader selected, rather than reading the
  // selection when the comment is submitted: clicking into the box moves focus,
  // and on some browsers that is enough to make the selection look empty.
  useEffect(() => {
    if (!editor) return;

    const capture = () => {
      const { from, to } = editor.state.selection;
      if (from === to) return;
      setSelection(describeSelection(editor.state.doc, from, to));
    };

    editor.on("selectionUpdate", capture);
    return () => {
      editor.off("selectionUpdate", capture);
    };
  }, [editor]);

  const anchors = useMemo<CommentAnchor[]>(
    () =>
      (threads ?? [])
        .filter((thread) => thread.quote)
        .map((thread) => ({
          id: thread.id,
          quote: thread.quote ?? "",
          prefix: thread.prefix,
          suffix: thread.suffix,
          resolved: thread.resolved_at !== null,
        })),
    [threads],
  );

  // Push the anchors into the highlight plugin. A transaction carrying only
  // meta changes no content — which is the point, and the reason a viewer sees
  // highlights on a document they cannot write to.
  //
  // `isDestroyed` is the guard that matters, and it is worth saying exactly
  // what it guards. TipTap builds the view inside the Editor constructor, so
  // there is no window where an editor exists without one. `destroy()` is the
  // hazard: it destroys the view but leaves `editor.view` set, so a truthiness
  // check would sail straight past a torn-down editor and throw on dispatch.
  // `isDestroyed` reads `!view?.docView`, which is true in both cases — no
  // view at all, and a view whose document was destroyed.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(SET_COMMENT_ANCHORS, anchors));
  }, [editor, anchors]);

  // A highlight was clicked in the document. If its thread is resolved, the
  // resolved section opens too — otherwise the click would appear to do
  // nothing, which is worse than either outcome.
  useEffect(() => {
    if (!openComment) return;
    setFocused(openComment);
    if ((threads ?? []).some((t) => t.id === openComment && t.resolved_at !== null)) {
      setShowResolved(true);
    }
    onOpenedComment?.();
  }, [openComment, threads, onOpenedComment]);

  const open = (threads ?? []).filter((thread) => thread.resolved_at === null);
  const resolved = (threads ?? []).filter((thread) => thread.resolved_at !== null);

  return (
    <section
      data-print-hide
      aria-label="Comments"
      className="border-t border-neutral-200 px-4 py-3"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-700">
          Comments
          {threads != null && threads.length > 0 && (
            <span className="ml-2 text-xs font-normal text-neutral-400">
              {open.length} open
            </span>
          )}
        </h2>
      </div>

      {error != null && (
        <ApiErrorMessage error={error} fallback="Could not load the comments." />
      )}

      {writable && (
        <ComposeBox
          documentId={documentId}
          people={people}
          // Refreshed when someone starts composing, not only at mount. Shares
          // change while a document is open — the owner adds a collaborator and
          // then wants to mention them — and a list fetched once cannot know.
          onCompose={loadPeople}
          anchor={selection}
          onClear={() => setSelection(null)}
          onPosted={() => {
            setSelection(null);
            void load();
          }}
        />
      )}

      {threads == null ? (
        <p className="py-2 text-sm text-neutral-500">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-200 p-4 text-center text-sm text-neutral-500">
          {writable
            ? "Select a passage and comment on it, or leave a note about the whole document."
            : "No comments yet."}
        </p>
      ) : (
        <ul className="grid gap-2">
          {open.map((thread) => (
            <ThreadCard
              key={thread.id}
              documentId={documentId}
              thread={thread}
              editor={editor}
              currentUserId={currentUserId}
              canWrite={writable}
              isOwner={permission === "owner"}
              focused={focused === thread.id}
              onChanged={load}
            />
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className="mt-3">
          {/* Collapsed behind a count rather than hidden: a resolved thread is a
              record of a decision, not rubbish. */}
          <button
            type="button"
            onClick={() => setShowResolved((shown) => !shown)}
            aria-expanded={showResolved}
            className="text-xs text-neutral-500 underline-offset-4 hover:text-carmine-500 hover:underline"
          >
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="mt-2 grid gap-2">
              {resolved.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  documentId={documentId}
                  thread={thread}
                  editor={editor}
                  currentUserId={currentUserId}
                  canWrite={writable}
                  isOwner={permission === "owner"}
                  focused={focused === thread.id}
                  onChanged={load}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ComposeBox({
  documentId,
  people,
  anchor,
  onClear,
  onPosted,
  onCompose,
}: {
  documentId: string;
  people: Mentionable[];
  anchor: Anchor | null;
  onClear: () => void;
  onPosted: () => void;
  onCompose: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || body.trim() === "") return;

    setBusy(true);
    setError(null);
    try {
      await createComment(documentId, {
        body: body.trim(),
        quote: anchor?.quote ?? null,
        prefix: anchor?.prefix ?? null,
        suffix: anchor?.suffix ?? null,
        // Read back out of the text rather than accumulated as they were
        // picked: deleting "@Ada" has to remove the mention, or Ada is told
        // about a comment that does not mention her.
        mention_user_ids: mentionedIn(body, people),
      });
      setBody("");
      onPosted();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-3 grid gap-2">
      {/* Says what the comment will be about before it is written, rather than
          after. A comment that silently landed on the whole document when the
          reader meant a sentence is the failure this prevents. */}
      <p className="text-xs text-neutral-500">
        {anchor ? (
          <>
            On “<span className="text-neutral-700">{truncate(anchor.quote)}</span>”{" "}
            <button
              type="button"
              onClick={onClear}
              className="underline underline-offset-2 hover:text-carmine-500"
            >
              comment on the document instead
            </button>
          </>
        ) : (
          "On the whole document — select a passage to comment on it instead."
        )}
      </p>
      <MentionField
        value={body}
        onChange={setBody}
        people={people}
        label="Write a comment"
        placeholder={people.length > 0 ? "Write a comment — @ to mention" : "Write a comment"}
        disabled={busy}
        onCompose={onCompose}
      />
      {error != null && (
        <ApiErrorMessage error={error} fallback="Could not post the comment." />
      )}
      <div>
        <Button type="submit" size="sm" disabled={busy || body.trim() === ""}>
          {busy ? "Posting…" : "Comment"}
        </Button>
      </div>
    </form>
  );
}

function ThreadCard({
  documentId,
  thread,
  editor,
  currentUserId,
  canWrite,
  isOwner,
  focused,
  onChanged,
}: {
  documentId: string;
  thread: CommentThread;
  editor: Editor | null;
  currentUserId: string | null;
  canWrite: boolean;
  isOwner: boolean;
  focused: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const card = useRef<HTMLLIElement>(null);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const isResolved = thread.resolved_at !== null;

  // Recomputed from the live document, not from the server: whether a passage
  // is still there is a question about what is on screen now.
  const detached =
    thread.quote != null &&
    editor != null &&
    locate(editor.state.doc, {
      quote: thread.quote,
      prefix: thread.prefix,
      suffix: thread.suffix,
    }) === null;

  useEffect(() => {
    if (focused) card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const scrollToPassage = () => {
    if (!editor || thread.quote == null) return;
    const range = locate(editor.state.doc, {
      quote: thread.quote,
      prefix: thread.prefix,
      suffix: thread.suffix,
    });
    if (range === null) return;

    editor.chain().focus().setTextSelection(range).scrollIntoView().run();
  };

  return (
    <li
      ref={card}
      className={cn(
        "rounded-lg border border-neutral-200 p-3 transition-colors",
        isResolved && "bg-neutral-50 text-neutral-500",
        focused && "border-carmine-500 ring-2 ring-carmine-500/20",
      )}
    >
      {thread.quote != null &&
        (detached ? (
          // Never reattached to the nearest plausible text: losing a highlight
          // is recoverable, pointing confidently at the wrong paragraph is not.
          <p className="mb-2 rounded border border-dashed border-neutral-300 px-2 py-1 text-xs text-neutral-500">
            The text this was about has changed. It said: “{truncate(thread.quote)}”
          </p>
        ) : (
          <button
            type="button"
            onClick={scrollToPassage}
            className="mb-2 block w-full truncate rounded bg-amber-50 px-2 py-1 text-left text-xs text-neutral-600 hover:bg-amber-100"
          >
            “{truncate(thread.quote)}”
          </button>
        ))}

      <CommentBody
        documentId={documentId}
        comment={thread}
        canEdit={currentUserId != null && thread.author_id === currentUserId}
        canDelete={isOwner || (currentUserId != null && thread.author_id === currentUserId)}
        onChanged={onChanged}
      />

      {thread.replies.length > 0 && (
        <ul className="mt-2 grid gap-2 border-l border-neutral-200 pl-3">
          {thread.replies.map((replyComment) => (
            <li key={replyComment.id}>
              <CommentBody
                documentId={documentId}
                comment={replyComment}
                canEdit={currentUserId != null && replyComment.author_id === currentUserId}
                canDelete={
                  isOwner || (currentUserId != null && replyComment.author_id === currentUserId)
                }
                onChanged={onChanged}
              />
            </li>
          ))}
        </ul>
      )}

      {error != null && (
        <ApiErrorMessage error={error} fallback="Could not update the thread." />
      )}

      {canWrite && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {replying ? (
            <form
              className="flex w-full flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (reply.trim() === "") return;
                void run(async () => {
                  await createComment(documentId, {
                    body: reply.trim(),
                    parent_id: thread.id,
                  });
                  setReply("");
                  setReplying(false);
                });
              }}
            >
              <input
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                aria-label="Write a reply"
                placeholder="Reply"
                maxLength={5000}
                disabled={busy}
                className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-sm outline-none focus-visible:border-carmine-500"
              />
              <Button type="submit" size="sm" disabled={busy || reply.trim() === ""}>
                Reply
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setReplying(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <>
              {/* Replies go one level deep, so this is offered on the thread and
                  never on a reply. */}
              <Button variant="ghost" size="sm" onClick={() => setReplying(true)}>
                Reply
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    updateComment(documentId, thread.id, { resolved: !isResolved }),
                  )
                }
              >
                {isResolved ? "Reopen" : "Resolve"}
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function CommentBody({
  documentId,
  comment,
  canEdit,
  canDelete,
  onChanged,
}: {
  documentId: string;
  comment: Comment;
  canEdit: boolean;
  canDelete: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      setEditing(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-1">
      <p className="text-xs text-neutral-500">
        {/* Null when the account was deleted: author_id is ON DELETE SET NULL,
            so a discussion outlives the account that took part in it. */}
        <span className="font-medium text-neutral-700">
          {comment.author_name ?? "Unknown"}
        </span>{" "}
        · {when(comment.created_at)}
      </p>

      {editing ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim() === "" || body.trim() === comment.body) {
              setEditing(false);
              return;
            }
            void run(() => updateComment(documentId, comment.id, { body: body.trim() }));
          }}
        >
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label="Edit comment"
            rows={2}
            maxLength={5000}
            disabled={busy}
            className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm outline-none focus-visible:border-carmine-500"
          />
          <div className="flex gap-1">
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setBody(comment.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm whitespace-pre-wrap text-neutral-800">{comment.body}</p>
      )}

      {error != null && (
        <ApiErrorMessage error={error} fallback="Could not update the comment." />
      )}

      {!editing && (canEdit || canDelete) && (
        <div className="flex gap-1">
          {/* Edit is the author's alone, even for the document owner. Changing
              someone's words while their name stays on them is forgery rather
              than moderation — deleting is the owner's remedy. */}
          {canEdit && (
            <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => void run(() => deleteComment(documentId, comment.id))}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function truncate(text: string, limit = 80) {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}
