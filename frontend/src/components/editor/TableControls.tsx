"use client";

import type { Editor } from "@tiptap/react";

import { Button } from "@/components/ui/button";

/** Row and column controls, shown only while the caret is inside a table.
 *
 * Always-visible controls would be six more buttons in a toolbar that is already
 * long, every one of them inert for the vast majority of a document. A table is
 * the only place they mean anything, so that is the only place they appear.
 */
export function TableControls({ editor }: { editor: Editor }) {
  if (!editor.isActive("table")) return null;

  const actions: [string, () => void][] = [
    ["Row above", () => editor.chain().focus().addRowBefore().run()],
    ["Row below", () => editor.chain().focus().addRowAfter().run()],
    ["Delete row", () => editor.chain().focus().deleteRow().run()],
    ["Column left", () => editor.chain().focus().addColumnBefore().run()],
    ["Column right", () => editor.chain().focus().addColumnAfter().run()],
    ["Delete column", () => editor.chain().focus().deleteColumn().run()],
    ["Delete table", () => editor.chain().focus().deleteTable().run()],
  ];

  return (
    <div
      role="toolbar"
      aria-label="Table"
      data-print-hide
      className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 [scrollbar-width:thin] sm:flex-wrap sm:overflow-x-visible"
    >
      <span className="px-1 text-xs font-medium text-neutral-500">Table</span>
      {actions.map(([label, run]) => (
        <Button
          key={label}
          variant="outline"
          size="sm"
          className="shrink-0"
          // Keeps the caret in the cell being operated on; without it the click
          // moves focus and the command applies to nothing.
          onMouseDown={(event) => event.preventDefault()}
          onClick={run}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
