"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { filterCommands, type SlashCommand } from "./slashCommands";

/** How many characters may follow the "/" before the menu gives up.
 *
 * Without a bound, typing a long sentence beginning with "/" keeps an empty
 * menu open forever. Someone who has typed twelve characters without matching
 * anything is writing, not choosing.
 */
const MAX_QUERY = 12;

/** A `/` menu for inserting any block type.
 *
 * Opens only at the start of an **empty** block. Anywhere else, "/" is an
 * ordinary character — in a URL, a date, a fraction — and a menu appearing
 * mid-sentence would be a bug rather than a feature.
 *
 * Rendered only for editors: everything it can do is refused for a viewer
 * anyway, and offering it would promise otherwise.
 */
export function SlashMenu({ editor }: { editor: Editor }) {
  const [query, setQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const open = query !== null;
  const matches = open ? filterCommands(query) : [];

  const close = useCallback(() => {
    setQuery(null);
    setSelected(0);
  }, []);

  const insert = useCallback(
    (command: SlashCommand) => {
      const { from } = editor.state.selection;
      // The typed "/query" is removed first, or the command text stays in the
      // document alongside the block it asked for.
      editor
        .chain()
        .focus()
        .deleteRange({ from: from - (query?.length ?? 0) - 1, to: from })
        .run();

      command.run(editor);
      close();
    },
    [editor, query, close],
  );

  // Tracks what has been typed since the "/", from the editor's own updates
  // rather than by listening to every keystroke — a transaction is the only
  // thing that knows what the document now contains.
  useEffect(() => {
    const onUpdate = () => {
      const { $from, empty } = editor.state.selection;
      if (!empty) return close();

      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");

      if (!before.startsWith("/")) return close();

      const typed = before.slice(1);
      if (typed.length > MAX_QUERY || typed.includes(" ")) return close();

      setQuery(typed);
      setSelected(0);
    };

    editor.on("update", onUpdate);
    editor.on("selectionUpdate", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      editor.off("selectionUpdate", onUpdate);
    };
  }, [editor, close]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return close();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        return setSelected((i) => (i + 1) % Math.max(matches.length, 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        return setSelected((i) => (i - 1 + matches.length) % Math.max(matches.length, 1));
      }
      if (event.key === "Enter" && matches[selected]) {
        event.preventDefault();
        insert(matches[selected]);
      }
    };

    // Capture phase: ProseMirror handles Enter and the arrows itself, and would
    // split the block before this ever saw the event.
    window.document.addEventListener("keydown", onKeyDown, true);
    return () => window.document.removeEventListener("keydown", onKeyDown, true);
  }, [open, matches, selected, insert, close]);

  if (!open || matches.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Insert a block"
      className="absolute z-50 mt-1 w-56 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
    >
      {matches.map((command, index) => (
        <button
          key={command.label}
          type="button"
          role="option"
          aria-selected={index === selected}
          // The editor keeps focus, so the keyboard path and the mouse path end
          // in exactly the same place.
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setSelected(index)}
          onClick={() => insert(command)}
          className={
            "block w-full px-3 py-1.5 text-left text-sm " +
            (index === selected ? "bg-neutral-100 text-carmine-700" : "text-neutral-700")
          }
        >
          {command.label}
        </button>
      ))}
    </div>
  );
}
