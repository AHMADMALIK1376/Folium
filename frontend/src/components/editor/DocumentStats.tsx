"use client";

import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

import { statisticsOf, type Statistics } from "@/lib/editor/document";

const EMPTY: Statistics = { words: 0, characters: 0, minutes: 0 };

function plural(n: number, one: string) {
  return `${n.toLocaleString()} ${one}${n === 1 ? "" : "s"}`;
}

/** Words, characters and reading time — Word's status bar.
 *
 * The count follows a selection when there is one, which is what Word does and
 * what people reach for when they need to know how long a paragraph is.
 */
export function DocumentStats({ editor }: { editor: Editor | null }) {
  const [stats, setStats] = useState<Statistics>(EMPTY);
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    if (!editor) return;

    const refresh = () => {
      const { from, to } = editor.state.selection;
      const hasSelection = to > from;
      setSelected(hasSelection);
      setStats(statisticsOf(editor.state.doc, hasSelection ? { from, to } : undefined));
    };

    refresh();
    // Both, because a selection changes the answer without changing the
    // document, and typing changes it without changing the selection.
    editor.on("update", refresh);
    editor.on("selectionUpdate", refresh);
    return () => {
      editor.off("update", refresh);
      editor.off("selectionUpdate", refresh);
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <p
      data-print-hide
      // A status region, so a screen reader can be asked for it without it
      // announcing itself on every keystroke.
      role="status"
      aria-label="Document statistics"
      className="flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500"
    >
      <span>{selected ? `${plural(stats.words, "word")} selected` : plural(stats.words, "word")}</span>
      <span>{plural(stats.characters, "character")}</span>
      {/* Omitted rather than shown as zero: "0 min read" is not a thing anyone
          wants to be told about an empty document. */}
      {stats.minutes > 0 && <span>{stats.minutes} min read</span>}
    </p>
  );
}
