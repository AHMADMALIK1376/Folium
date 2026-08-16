import type { Editor } from "@tiptap/react";

/** Everything the slash menu can insert.
 *
 * One array, so a type added in a later phase is one entry here rather than a
 * change to the menu — the same reason the toolbar and the converters are held
 * to `editor-schema.json`. Nothing in this list is new: every command already
 * has a toolbar button, which is why the menu carries no risk of its own.
 */
export type SlashCommand = {
  label: string;
  /** Extra words that should match, beyond the label. "bullet" finding the
   *  bulleted list matters more than the label being exactly right. */
  keywords: string[];
  run: (editor: Editor) => void;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    label: "Heading 1",
    keywords: ["h1", "title", "big"],
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: "Heading 2",
    keywords: ["h2", "subtitle", "section"],
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: "Text",
    keywords: ["paragraph", "body", "plain"],
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    label: "Bulleted list",
    keywords: ["bullet", "unordered", "ul", "list"],
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    keywords: ["number", "ordered", "ol", "list"],
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Checklist",
    keywords: ["task", "todo", "check", "box"],
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    label: "Quote",
    keywords: ["blockquote", "citation"],
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    keywords: ["code", "pre", "snippet"],
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: "Divider",
    keywords: ["rule", "hr", "separator", "line"],
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    label: "Table",
    keywords: ["grid", "rows", "columns"],
    run: (editor) =>
      editor
        .chain()
        .focus()
        // With a header row, because GFM has no way to express a table without
        // one: a headerless table exports as prose containing pipes.
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
];

/** Commands matching a query, in the array's own order.
 *
 * Not ranked by score: the list is short and a stable order means the first
 * entry does not move under the fingers of someone typing quickly.
 */
export function filterCommands(query: string): SlashCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return SLASH_COMMANDS;

  return SLASH_COMMANDS.filter(
    (command) =>
      command.label.toLowerCase().includes(needle) ||
      command.keywords.some((keyword) => keyword.includes(needle)),
  );
}
