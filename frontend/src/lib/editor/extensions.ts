import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Table from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
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
    // Markdown has no spelling for these three, so they travel as HTML tags —
    // the same exception underline has had since Phase 5-i, and for the same
    // reason: the editor offers them, and dropping them on export would lose
    // something the author deliberately applied. <mark>, <sub> and <sup> are
    // understood by every renderer that matters.
    Highlight,
    Subscript,
    Superscript,
    Image.configure({
      // Block-level only. An inline image inside a paragraph has no Markdown
      // spelling that survives a round trip cleanly, and the editor gains
      // little from it.
      inline: false,
      // Every image is an attachment of its own document, so its src is always
      // a Folium URL. Base64 in the document would put a 2MB photo into the
      // JSONB column and into every version snapshot of it.
      allowBase64: false,
    }),
    TaskList,
    // Nesting is out of scope this phase, and the Markdown converters would have
    // to learn indentation to carry it.
    TaskItem.configure({ nested: false }),
    Table.configure({
      // GFM has no column widths, so a resized column would look right in the
      // editor and vanish on export — a difference the author never asked for
      // and would only discover later.
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
    // --- Formatting Markdown cannot carry ---
    //
    // Deliberately accepted as LOSSY on Markdown export, which is a change of
    // policy rather than an oversight. Everything above round-trips exactly;
    // these do not, because Markdown has no way to say "this is red" or "this
    // paragraph is centred" and inventing HTML for it would mean the importer
    // needing a real HTML parser.
    //
    // The trade was made openly: TipTap JSON is the storage format and the
    // record of truth, Markdown is one export among several, and requiring
    // Markdown parity capped the editor at what Markdown can express. What must
    // never happen is losing it SILENTLY — so `editor-schema.json` lists these
    // as `lossy`, a test asserts they drop cleanly rather than corrupting text,
    // and the export dialog warns before writing a .md file that omits them.
    //
    // PDF export keeps all of it, because that is the browser rendering what is
    // on screen.
    TextStyle,
    Color,
    FontFamily,
    TextAlign.configure({
      // Headings and paragraphs only. Alignment on a list item or a table cell
      // is a different question with its own answers, and this is wide enough.
      types: ["heading", "paragraph"],
    }),
  ];
}
