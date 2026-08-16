import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

/** The protocols a link may use.
 *
 * Kept in step with ALLOWED_PROTOCOLS in backend/app/utils/import_file.py, and
 * enforced in both places on purpose: a `.md` file is untrusted input and the
 * importer is a second door into the same document, so a filter that lived only
 * here would be decoration.
 *
 * The reason this list is short: a link is the first content type where the
 * author supplies something the *reader's* browser will act on. `javascript:`
 * in an href is script execution in the reader's session, on a document they may
 * only be allowed to view — stored XSS in a collaborative editor, which is the
 * worst shape it comes in.
 */
export const ALLOWED_LINK_PROTOCOLS = ["http", "https", "mailto"] as const;

/** Every extension the editor is built with, in one place.
 *
 * Shared with `editorSchema.test.ts` deliberately. That test asserts the
 * editor's schema matches `editor-schema.json`, and it used to read its own
 * hardcoded list — which could drift from what DocumentEditor actually used,
 * leaving the contract checking something nothing rendered. Reading the same
 * array closes that gap.
 *
 * @param withHistory TipTap's own undo stack. Must be off under Collaboration,
 * which brings a Yjs-aware undo manager; running both means undo either skips
 * your own edits or reverts someone else's.
 */
export function baseExtensions({ withHistory }: { withHistory: boolean }) {
  return [
    withHistory ? StarterKit : StarterKit.configure({ history: false }),
    Underline,
    Link.configure({
      // The editor does not follow links on click — a click places the caret,
      // because this is a document being written, not read.
      openOnClick: false,
      // Off deliberately. Autolink turns anything URL-shaped into a link as you
      // type and on paste, which creates links the author never asked for and
      // is a surprise in a document that legitimately mentions one as text.
      autolink: false,
      protocols: [...ALLOWED_LINK_PROTOCOLS],
      HTMLAttributes: {
        // noopener is not decoration: without it the opened page can reach back
        // through window.opener and navigate the tab it came from.
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    TaskList,
    // Nesting is out of scope this phase, and the Markdown converters would have
    // to learn indentation to carry it.
    TaskItem.configure({ nested: false }),
  ];
}
