"use client";

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import { ShareDialog } from "@/components/documents/ShareDialog";
import { AttachmentsPanel } from "@/components/editor/AttachmentsPanel";
import { CommentsPanel } from "@/components/editor/CommentsPanel";
import { DocumentOutline } from "@/components/editor/DocumentOutline";
import { DocumentStats } from "@/components/editor/DocumentStats";
import { ConnectionStatus } from "@/components/editor/ConnectionStatus";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { ExportDialog } from "@/components/editor/ExportDialog";
import { FindReplaceBar } from "@/components/editor/FindReplaceBar";
import { FormattingControls } from "@/components/editor/FormattingControls";
import { PageSetupControl } from "@/components/editor/PageSetupControl";
import {
  pageSetupCss,
  withDefaults,
  type PageSetup,
} from "@/lib/editor/pageSetup";
import { HistoryDialog } from "@/components/editor/HistoryDialog";
import { SaveStatus } from "@/components/editor/SaveStatus";
import { ShortcutsDialog } from "@/components/editor/ShortcutsDialog";
import { SlashMenu } from "@/components/editor/SlashMenu";
import { TemplateToggle } from "@/components/editor/TemplateToggle";
import { TableControls } from "@/components/editor/TableControls";
import { updateDocument, type DocumentPatch } from "@/lib/api/documents";
import type { DocumentDetail, TipTapDoc } from "@/lib/api/types";
// Aliased: TipTap's Collaboration extension already owns that name here.
import type { Collaboration as CollaborationState } from "@/lib/collab/useCollaboration";
import { cursorColor } from "@/lib/collab/color";
import { decideOnSync } from "@/lib/collab/reconcile";
import { useCollaboration } from "@/lib/collab/useCollaboration";
import { CommentHighlights } from "@/lib/editor/commentHighlights";
import { FindReplace } from "@/lib/editor/findReplace";
import { baseExtensions } from "@/lib/editor/extensions";
import { useAutosave } from "@/lib/hooks/useAutosave";

/** Whether the document itself may be changed.
 *
 * `comment` is not editing: a commenter writes in the panel and never in the
 * document. This mirrors the backend's `can_edit`, which is the real boundary —
 * a PATCH from anyone else gets a 404 whatever this returns. */
function canEdit(document: DocumentDetail) {
  return document.permission === "owner" || document.permission === "edit";
}

/** The editor itself, mounted only once collaboration has resolved one way or
 *  the other.
 *
 *  That is the whole reason this is a separate component. When the collaboration
 *  state arrived while this was already mounted, the extension list changed,
 *  TipTap tore the editor down and built a new one — and everything typed in the
 *  intervening seconds went with it. Deciding first and mounting once means the
 *  editor is built with its final configuration and never rebuilt. */
function DocumentEditorSurface({
  document,
  collab,
}: {
  document: DocumentDetail;
  collab: CollaborationState;
}) {
  const router = useRouter();
  const editable = canEdit(document);
  const [title, setTitle] = useState(document.title);
  // Set when a highlight in the document is clicked, so the panel can bring
  // that thread to the reader rather than making them find it.
  const [openComment, setOpenComment] = useState<string | null>(null);
  // Raised by Ctrl+F and by the Find button. Held here because both need it.
  const [finding, setFinding] = useState(false);

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

  // Held in state as well as saved, so the page redraws as the setting changes
  // rather than after the round trip. Seeded from the document, widened once
  // here: null from the API means "never set up", and everything below wants a
  // complete setup rather than a question.
  const [pageSetup, setPageSetup] = useState<PageSetup>(() =>
    withDefaults(document.page_setup),
  );

  const changePageSetup = useCallback(
    (next: PageSetup) => {
      setPageSetup(next);
      // Through the same autosave as everything else, so it is debounced with
      // the typing around it and flushed on unload by machinery that already
      // works.
      schedule({ page_setup: next });
    },
    [schedule],
  );

  const editor = useEditor({
    extensions: [
      // Shared with editorSchema.test.ts, which asserts this schema matches
      // editor-schema.json. Reading the same array is what stops the contract
      // describing an editor nobody renders.
      ...baseExtensions({ withHistory: !collab.enabled }),
      // Not part of baseExtensions, deliberately: that array is the schema
      // contract checked against editor-schema.json, and this contributes no
      // nodes and no marks. Highlights are decorations — a view-layer overlay
      // that never touches content, which is exactly why a commenter who may
      // not write the document can still see and make them.
      CommentHighlights.configure({ onSelect: (id) => setOpenComment(id) }),
      // Also outside baseExtensions, and for the same reason: find draws
      // decorations and contributes no nodes or marks. Searching a document
      // must not be able to change it, and a decoration cannot.
      FindReplace,
      ...(collab.enabled && collab.doc
        ? [
            Collaboration.configure({ document: collab.doc }),
            CollaborationCursor.configure({
              provider: collab.provider,
              // The signed-in user, not the document's owner. Labelling every
              // caret with the owner meant that on a shared document everyone
              // appeared as the person who created it.
              user: {
                name: collab.user?.display_name || "Someone",
                color: cursorColor(collab.user?.id ?? ""),
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
        // No padding of its own any more. The sheet around it carries the
        // document's margins, and padding here would add to them -- an inch
        // of margin plus a quarter of editor chrome is not an inch.
        class: "folium-prose min-h-[40vh] outline-none",
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
  // Constant for this component's lifetime: it mounts only after collaboration
  // has resolved, so these never change and the editor is never rebuilt. Listed
  // anyway, because the configuration above genuinely depends on them.
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

    // Reconcile the room and the database — but only after the provider says it
    // has synced.
    //
    // This is the trap the whole feature turns on. Before sync, every client's
    // Y.Doc is empty, so seeding on mount means each one inserts the document
    // and the text appears two or three times. After sync, "empty" means
    // genuinely empty: nobody has ever opened this document collaboratively,
    // and the copy in Postgres is the one to start from.
    const reconcile = (synced: boolean) => {
      if (!synced) return;

      const roomContent = editor.getJSON() as TipTapDoc;
      switch (decideOnSync(editor.isEmpty, roomContent, document.content)) {
        case "seed":
          editor.commands.setContent(document.content as JSONContent);
          break;
        case "save":
          // The room is ahead of the database — everyone left before autosave
          // fired. Through the normal save path, so Phase 3 snapshots it like
          // any other edit rather than smuggling content past version history.
          schedule({ content: roomContent });
          break;
        case "none":
          break;
      }
    };

    collab.provider.on("synced", reconcile);
    return () => collab.provider?.off("synced", reconcile);
  }, [collab.enabled, collab.provider, editor, editable, document.content, schedule]);

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
      <div
        data-print-hide
        className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3"
      >
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

        {/* Only when there is a room to be connected to. With collaboration off
            there is nothing to report, and an indicator would imply otherwise. */}
        {collab.enabled && <ConnectionStatus status={collab.status} />}

        {/* Offered whatever the permission: exporting is reading. */}
        <ExportDialog documentId={document.id} content={editor?.getJSON()} />

        {/* A visible way in. Ctrl+F is the shortcut people already have, but
            it is the browser's shortcut being taken over — nobody would guess
            this app has its own unless it says so. */}
        <Button variant="ghost" size="sm" onClick={() => setFinding(true)}>
          Find
        </Button>

        <ShortcutsDialog />

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
            collect errors. The same is true of the template flag. */}
        {document.permission === "owner" && (
          <>
            <TemplateToggle
              documentId={document.id}
              isTemplate={document.is_template}
            />
            <ShareDialog documentId={document.id} />
          </>
        )}
      </div>

      {!editable && (
        <p className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">
          {document.permission === "comment" ? (
            <>
              {document.owner.display_name} shared this with you for commenting — you can
              join the discussion below, but not change the document.
            </>
          ) : (
            <>
              This document is read-only — {document.owner.display_name} shared it with you
              for viewing.
            </>
          )}
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

      {/* Screen shows the title in the header above; print hides that whole row,
          so the printed page needs a heading of its own. */}
      <h1 className="hidden px-6 pt-6 text-2xl font-semibold text-neutral-900 print:block">
        {title}
      </h1>

      {/* Above the toolbar, where a find bar belongs, and offered at every
          permission: finding is reading. Replace is the bar's own decision. */}
      <FindReplaceBar
        editor={editor}
        canEdit={editable}
        open={finding}
        onOpenChange={setFinding}
      />

      {/* Hides itself when the document has no headings. */}
      <DocumentOutline editor={editor} />

      {editor && editable && <EditorToolbar editor={editor} documentId={document.id} />}
      {editor && editable && <FormattingControls editor={editor} />}
      {editor && editable && <TableControls editor={editor} />}
      {editor && editable && (
        <div
          role="toolbar"
          aria-label="Page"
          data-print-hide
          className="flex items-center gap-2 border-b border-neutral-200 px-2 py-1.5"
        >
          <PageSetupControl setup={pageSetup} onChange={changePageSetup} />
        </div>
      )}
      {/* Positioned relative so the menu can hang off the editor rather than the
          page, and rendered only for editors — everything it inserts is refused
          for a viewer anyway. */}
      {/* The document's own page rules, injected rather than written in the
          stylesheet: they differ per document, and @page in particular cannot
          be parameterised any other way. It is also the only thing the
          browser's print dialog obeys, so without this a PDF comes out on
          whatever paper the printer defaults to. */}
      <style>{pageSetupCss(pageSetup)}</style>

      {/* Positioned relative so the menu can hang off the editor rather than the
          page, and rendered only for editors — everything it inserts is refused
          for a viewer anyway. */}
      <div className="relative flex justify-center overflow-x-auto bg-neutral-100 py-6 print:block print:overflow-visible print:bg-transparent print:p-0">
        <div className="folium-page bg-white shadow-md print:shadow-none">
          <EditorContent editor={editor} />
        </div>
        {editor && editable && <SlashMenu editor={editor} />}
      </div>

      <DocumentStats editor={editor} />

      {/* Absent entirely when the deployment has no storage key, rather than an
          empty state or an error: an unconfigured feature is not a broken one,
          and the same is true of collaboration's indicator above. */}
      {document.attachments_enabled && (
        <AttachmentsPanel documentId={document.id} canEdit={editable} />
      )}

      {/* Shown at every permission level, including view: reading a discussion
          about a document is part of reading the document. Whether the compose
          box appears is the panel's own decision, and the backend's. */}
      <CommentsPanel
        documentId={document.id}
        permission={document.permission}
        currentUserId={collab.user?.id ?? null}
        editor={editor}
        // The owner is mentionable and is not in the share list, so the panel
        // cannot work them out on its own.
        owner={document.owner}
        openComment={openComment}
        onOpenedComment={() => setOpenComment(null)}
      />
    </div>
  );
}

/** Decide whether this document is collaborative, then mount the editor.
 *
 * Nothing is rendered into the editing surface until that is known. The wait is
 * a network round trip to mint a room token — normally imperceptible, and
 * always preferable to mounting an editor that has to be replaced, which is how
 * typing got discarded before.
 */
export function DocumentEditor({ document }: { document: DocumentDetail }) {
  const collab = useCollaboration(document.id);

  if (collab.loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <Link
            href="/dashboard"
            prefetch={false}
            className="text-sm text-neutral-500 hover:text-carmine-500"
          >
            ← Documents
          </Link>
          <h1 className="min-w-0 flex-1 truncate px-2 py-1 text-lg font-medium text-neutral-900">
            {document.title}
          </h1>
        </div>
        <p className="px-6 py-5 text-sm text-neutral-500">Opening…</p>
      </div>
    );
  }

  return <DocumentEditorSurface document={document} collab={collab} />;
}
