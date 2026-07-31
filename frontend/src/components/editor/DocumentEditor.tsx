"use client";

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { ShareDialog } from "@/components/documents/ShareDialog";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { HistoryDialog } from "@/components/editor/HistoryDialog";
import { SaveStatus } from "@/components/editor/SaveStatus";
import { updateDocument, type DocumentPatch } from "@/lib/api/documents";
import type { DocumentDetail, TipTapDoc } from "@/lib/api/types";
import { cursorColor } from "@/lib/collab/color";
import { useCollaboration } from "@/lib/collab/useCollaboration";
import { useAutosave } from "@/lib/hooks/useAutosave";

/** Read-only covers `comment` as well as `view`.
 *
 * Commenting is not built yet, and a comment UI that cannot save would be worse
 * than none. This mirrors the backend's `can_edit`, which is the real boundary —
 * a PATCH from anyone else gets a 404 whatever this returns. */
function canEdit(document: DocumentDetail) {
  return document.permission === "owner" || document.permission === "edit";
}

export function DocumentEditor({ document }: { document: DocumentDetail }) {
  const router = useRouter();
  const editable = canEdit(document);
  const [title, setTitle] = useState(document.title);

  const save = useCallback(
    async (patch: DocumentPatch, init?: RequestInit) => {
      const saved = await updateDocument(document.id, patch, init);

      // Only for a rename, and only after it succeeded. The dashboard shows
      // titles, and Next serves it from the client Router Cache — prefetched
      // when this page loaded, so from before the rename. Without this,
      // renaming and clicking straight back showed the old title.
      //
      // Not done for content saves: nothing outside this page displays the body,
      // and refreshing on every keystroke batch would re-run the server render
      // mid-edit for no one's benefit.
      if (patch.title !== undefined) router.refresh();

      return saved;
    },
    [document.id, router],
  );
  const { status, error, schedule, flush } = useAutosave({ save });

  const collab = useCollaboration(document.id);

  const editor = useEditor({
    extensions: [
      // History is TipTap's own undo stack. With Collaboration it must be off:
      // Collaboration brings a Yjs-aware undo manager, and running both means
      // undo either skips your own edits or reverts someone else's.
      collab.enabled ? StarterKit.configure({ history: false }) : StarterKit,
      Underline,
      ...(collab.enabled && collab.doc
        ? [
            Collaboration.configure({ document: collab.doc }),
            CollaborationCursor.configure({
              provider: collab.provider,
              user: {
                name: document.owner.display_name || "Someone",
                color: cursorColor(document.owner_id),
              },
            }),
          ]
        : []),
    ],
    // Seeded once, and only when editing alone. Re-seeding from props on
    // re-render would move the caret out from under the user: from mount onward
    // the editor owns its own content.
    //
    // Under collaboration the Y.Doc is the source of truth, and seeding here as
    // well would insert the document a second time — once from props and once
    // from the room. The room is seeded separately, after sync, and only if it
    // is genuinely empty.
    //
    // The cast is the one place the loose wire type meets TipTap's own. Our
    // TipTapDoc deliberately does not restate the node tree — the backend
    // validates every write against it — so nothing here can narrow it
    // truthfully; TipTap rejects malformed content at parse time regardless.
    content: collab.enabled ? undefined : (document.content as JSONContent),
    editable,
    // TipTap renders synchronously by default, producing server markup the
    // client cannot match. Required for any editor inside a Server Component
    // tree, which this always is.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "folium-prose min-h-[60vh] px-6 py-5 outline-none",
        // ProseMirror sets only contenteditable, which confers no role of its
        // own — assistive technology and role-based test queries alike see a
        // plain div. Declaring textbox + aria-multiline is the documented
        // pattern for a rich-text region, and makes the editor addressable by
        // what it is rather than by a CSS class.
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Document body",
      },
    },
    onUpdate: ({ editor, transaction }) => {
      // Yjs applies remote edits as transactions here too. Without this filter
      // every connected client would PATCH every keystroke everyone typed,
      // multiplying writes by the number of people in the room and racing them
      // against each other.
      if (collab.enabled && transaction.getMeta("y-sync$")) return;
      schedule({ content: editor.getJSON() as TipTapDoc });
    },
  },
  // Rebuilt when collaboration arrives: the extension list and the content
  // seeding both depend on it, and the token request resolves after mount.
  [collab.enabled, collab.doc, collab.provider]);

  useEffect(() => {
    if (!editor) return;
    // Permission cannot change without a fresh server render today, but keeping
    // these in step means a future change cannot leave an editable editor on a
    // document the backend will refuse to save.
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!collab.enabled || !collab.provider || !editor || !editable) return;

    // Seed a room that has never held this document — but only after the
    // provider says it has synced.
    //
    // This is the trap the whole feature turns on. Before sync, every client's
    // Y.Doc is empty, so seeding on mount means each one inserts the document
    // and the text appears two or three times. After sync, "empty" means
    // genuinely empty: nobody has ever opened this document collaboratively,
    // and the copy in Postgres is the one to start from.
    const seedIfEmpty = (synced: boolean) => {
      if (!synced || !editor.isEmpty) return;
      editor.commands.setContent(document.content as JSONContent);
    };

    collab.provider.on("synced", seedIfEmpty);
    return () => collab.provider?.off("synced", seedIfEmpty);
  }, [collab.enabled, collab.provider, editor, editable, document.content]);

  useEffect(() => {
    if (!editable) return;

    // Two listeners, not one: beforeunload does not fire when mobile Safari
    // discards a backgrounded tab, and visibilitychange does not fire on a
    // same-tab navigation in every browser. Both are cheap, and flush() is a
    // no-op when nothing is pending.
    const onBeforeUnload = () => flush();
    const onVisibilityChange = () => {
      // `document` here is the prop, so the global needs qualifying.
      if (window.document.visibilityState === "hidden") flush();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [editable, flush]);

  const onTitleChange = (value: string) => {
    setTitle(value);
    // A blank title is a 422 from the backend, so it is never sent. The input
    // stays empty while typing — clearing it to retype is normal — and reverts
    // on blur.
    if (value.trim() !== "") schedule({ title: value });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3">
        <Link
          href="/dashboard"
          // Not prefetched, deliberately. A prefetch of the dashboard happens
          // when this page loads — before anything is renamed — and Next would
          // then serve that payload on click, showing the old title. The
          // dashboard is one navigation away and server-renders quickly; a
          // stale title is a worse trade than a few hundred milliseconds.
          prefetch={false}
          className="text-sm text-neutral-500 hover:text-carmine-500"
        >
          ← Documents
        </Link>

        {editable ? (
          <input
            value={title}
            aria-label="Document title"
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={() => title.trim() === "" && setTitle(document.title)}
            className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-lg font-medium text-neutral-900 hover:border-neutral-200 focus-visible:border-carmine-500 focus-visible:outline-none"
          />
        ) : (
          <h1 className="min-w-0 flex-1 truncate px-2 py-1 text-lg font-medium text-neutral-900">
            {document.title}
          </h1>
        )}

        {editable && <SaveStatus status={status} />}

        <HistoryDialog
          documentId={document.id}
          canEdit={editable}
          onRestored={(content) => {
            // The one place the editor takes content after mount.
            //
            // 2C-ii seeds `content` once and never re-seeds from props, because
            // a re-render would move the caret out from under whoever is typing.
            // A restore is the legitimate exception: the content genuinely
            // changed, at this user's explicit request. Applied as a command
            // rather than through props, so it happens exactly once and cannot
            // re-fire on an unrelated re-render.
            editor?.commands.setContent(content as JSONContent);
          }}
        />

        {/* Owners only, not editors: the backend answers 404 to share mutations
            from anyone but the owner, so an editor given this could only ever
            collect errors. */}
        {document.permission === "owner" && <ShareDialog documentId={document.id} />}
      </div>

      {!editable && (
        <p className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
          This document is read-only — {document.owner.display_name} shared it with you
          for viewing.
        </p>
      )}

      {status === "failed" && error != null && (
        <div className="px-4 pt-3">
          <ApiErrorMessage
            error={error}
            fallback="Could not save your changes. They are still here — the next edit will try again."
          />
        </div>
      )}

      {editor && editable && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
