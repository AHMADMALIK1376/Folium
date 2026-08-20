"use client";

import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { useEffect, useState } from "react";

import { outlineOf, type Heading } from "@/lib/editor/document";
import { cn } from "@/lib/utils";

/** Jump to a heading. Word calls it the Navigation Pane.
 *
 * Absent when the document has no headings, rather than an empty panel: an
 * outline with nothing in it promises a structure the document has not got, and
 * takes up space to do it.
 */
export function DocumentOutline({ editor }: { editor: Editor | null }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!editor) return;

    // Recomputed from the document rather than stored. There is nothing here
    // the document does not already contain, so there is nothing to keep in
    // step and nothing that can go stale.
    const refresh = () => setHeadings(outlineOf(editor.state.doc));

    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
  }, [editor]);

  if (!editor || headings.length === 0) return null;

  const jumpTo = (heading: Heading) => {
    const tr = editor.state.tr;
    // +1 to land inside the heading rather than before it, so the caret is
    // where someone who clicked "Background" expects to start typing.
    tr.setSelection(TextSelection.create(tr.doc, Math.min(heading.pos + 1, tr.doc.content.size)));
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  };

  return (
    <nav
      data-print-hide
      aria-label="Document outline"
      className="border-b border-neutral-200 px-4 py-2"
    >
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        className="text-xs font-medium text-neutral-500 hover:text-carmine-500"
      >
        {open ? "▾" : "▸"} Outline
        <span className="ml-2 font-normal text-neutral-400">{headings.length}</span>
      </button>

      {open && (
        <ul className="mt-1 grid gap-0.5">
          {headings.map((heading, index) => (
            // Position is not a key: two headings can share text, and a
            // position changes on every edit above it. The index is stable for
            // the render it belongs to, which is all a key has to be here.
            <li key={`${heading.pos}-${index}`}>
              <button
                type="button"
                onClick={() => jumpTo(heading)}
                className={cn(
                  "block w-full truncate rounded px-2 py-0.5 text-left text-sm text-neutral-600 hover:bg-neutral-50 hover:text-carmine-600",
                  heading.level === 2 && "pl-5",
                  heading.level >= 3 && "pl-8",
                )}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
