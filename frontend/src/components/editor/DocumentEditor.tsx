"use client";

import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { ShareDialog } from "@/components/documents/ShareDialog";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { SaveStatus } from "@/components/editor/SaveStatus";
import { updateDocument, type DocumentPatch } from "@/lib/api/documents";
import type { DocumentDetail, TipTapDoc } from "@/lib/api/types";
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
  const editable = canEdit(document);
  const [title, setTitle] = useState(document.title);

  const save = useCallback(
    (patch: DocumentPatch, init?: RequestInit) =>
      updateDocument(document.id, patch, init),
    [document.id],
  );
  const { status, error, schedule, flush } = useAutosave({ save });

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    // Seeded once. Re-seeding from props on re-render would move the caret out
    // from under the user: from mount onward the editor owns its own content.
    //
    // The cast is the one place the loose wire type meets TipTap's own. Our
    // TipTapDoc deliberately does not restate the node tree — the backend
    // validates every write against it — so nothing here can narrow it
    // truthfully; TipTap rejects malformed content at parse time regardless.
    content: document.content as JSONContent,
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
    onUpdate: ({ editor }) => schedule({ content: editor.getJSON() as TipTapDoc }),
  });

  useEffect(() => {
    if (!editor) return;
    // Permission cannot change without a fresh server render today, but keeping
    // these in step means a future change cannot leave an editable editor on a
    // document the backend will refuse to save.
    editor.setEditable(editable);
  }, [editable, editor]);

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
