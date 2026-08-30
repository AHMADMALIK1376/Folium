"use client";

import { TextSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";

import { outlineOf, type Heading } from "@/lib/editor/document";

/** The contents list, drawn from the document each time it changes.
 *
 * Reads `outlineOf` — the same function the Outline panel uses, rather than a
 * second heading walker that could disagree with it. The difference between the
 * two is where they live and what they are for: the panel is navigation and is
 * hidden when printing, this is part of the document and is printed with it.
 *
 * There is no "update this field" anywhere, because there is nothing to update.
 */
export function TableOfContentsView({ editor }: NodeViewProps) {
  const [headings, setHeadings] = useState<Heading[]>(() => outlineOf(editor.state.doc));

  useEffect(() => {
    const refresh = () => setHeadings(outlineOf(editor.state.doc));

    refresh();
    editor.on("update", refresh);
    return () => {
      editor.off("update", refresh);
    };
  }, [editor]);

  const jumpTo = (heading: Heading) => {
    const tr = editor.state.tr;
    // +1 to land inside the heading rather than before it.
    tr.setSelection(
      TextSelection.create(tr.doc, Math.min(heading.pos + 1, tr.doc.content.size)),
    );
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  };

  return (
    <NodeViewWrapper
      className="folium-toc my-4 rounded-md border border-neutral-200 px-4 py-3"
      aria-label="Table of contents"
    >
      <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        Contents
      </p>

      {headings.length === 0 ? (
        // Kept rather than hidden, unlike the Outline panel. This one is a
        // block someone deliberately inserted: making it vanish would look like
        // the insert had failed, and there would be nothing left to delete.
        <p className="text-sm text-neutral-400">
          Headings will appear here as you add them.
        </p>
      ) : (
        <ol className="grid gap-0.5">
          {headings.map((heading) => (
            <li
              key={`${heading.pos}-${heading.text}`}
              style={{ paddingLeft: `${(heading.level - 1) * 1.1}rem` }}
            >
              <button
                type="button"
                // The node is an atom, so a click inside it would otherwise
                // select the whole block rather than reaching this handler.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => jumpTo(heading)}
                className="w-full text-left text-sm text-neutral-700 hover:text-carmine-600 hover:underline"
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </NodeViewWrapper>
  );
}
