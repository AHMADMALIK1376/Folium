"use client";

import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  SET_CURRENT,
  SET_SEARCH,
  findReplaceKey,
  type SearchQuery,
} from "@/lib/editor/findReplace";
import { cn } from "@/lib/utils";

/** Find, and replace for those who may.
 *
 * Ctrl+F is intercepted rather than left to the browser, and that is a debt
 * this has to repay: the browser's own find searches rendered text, cannot
 * replace, and cannot tell the editor where it landed. Taking the shortcut is
 * only defensible if what replaces it is better.
 *
 * Everything except replace is read-only — matches are ProseMirror decorations,
 * so searching a document cannot change it.
 */
export function FindReplaceBar({
  editor,
  canEdit,
  open,
  onOpenChange,
}: {
  editor: Editor | null;
  canEdit: boolean;
  /** Controlled from the editor, so a visible Find button can raise it. Ctrl+F
   *  is undiscoverable on its own — the only people who would try it are those
   *  who already expect the browser's, which is the one this replaces. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [needle, setNeedle] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [state, setState] = useState({ total: 0, current: 0 });
  const field = useRef<HTMLInputElement>(null);
  const setOpen = onOpenChange;

  const search = useCallback(
    (query: SearchQuery | null) => {
      if (!editor || editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta(SET_SEARCH, query));
    },
    [editor],
  );

  // Ctrl+F and Ctrl+H, captured on the window so they work wherever the caret
  // is. preventDefault is the whole point: the browser's find would otherwise
  // open over the top of this one and be worse.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        setOpen(true);
        field.current?.focus();
        field.current?.select();
      } else if (canEdit && (event.key === "h" || event.key === "H")) {
        event.preventDefault();
        setOpen(true);
        setShowReplace(true);
        field.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit]);

  useEffect(() => {
    if (!open) return;
    // Focused whichever way it was opened — shortcut or button — because a
    // find bar you then have to click into is a find bar that wasted a step.
    field.current?.focus();
    field.current?.select();
  }, [open]);

  // Re-run the search whenever the question changes.
  useEffect(() => {
    if (!open) return;
    search(needle ? { needle, matchCase } : null);
  }, [open, needle, matchCase, search]);

  // Closing clears the highlights. Leaving them behind would mark up a document
  // for a search nobody is doing any more.
  useEffect(() => {
    if (open) return;
    search(null);
    setState({ total: 0, current: 0 });
  }, [open, search]);

  // The plugin owns the match list, so read it back rather than keeping a
  // second copy that could disagree.
  useEffect(() => {
    if (!editor) return;

    const sync = () => {
      const plugin = findReplaceKey.getState(editor.state);
      setState({ total: plugin?.matches.length ?? 0, current: plugin?.current ?? 0 });
    };

    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor]);

  const goTo = (index: number) => {
    if (!editor || editor.isDestroyed) return;
    const plugin = findReplaceKey.getState(editor.state);
    if (!plugin || plugin.matches.length === 0) return;

    const at = ((index % plugin.matches.length) + plugin.matches.length) % plugin.matches.length;
    const match = plugin.matches[at];

    // Selection moved and scrolled, but focus deliberately left in the find
    // field: Word does the same, and typing another letter should refine the
    // search rather than the document.
    const tr = editor.state.tr.setMeta(SET_CURRENT, at);
    tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView();
    editor.view.dispatch(tr);
  };

  const replaceCurrent = () => {
    if (!editor || editor.isDestroyed || !canEdit) return;
    const plugin = findReplaceKey.getState(editor.state);
    const match = plugin?.matches[plugin.current];
    if (!match) return;

    editor
      .chain()
      .focus()
      .insertContentAt({ from: match.from, to: match.to }, replacement)
      .run();
    // The plugin re-finds on a document change, so the next match becomes the
    // current one without asking.
    goTo(plugin!.current);
  };

  const replaceAll = () => {
    if (!editor || editor.isDestroyed || !canEdit) return;
    const plugin = findReplaceKey.getState(editor.state);
    if (!plugin || plugin.matches.length === 0) return;

    // One transaction, so one undo step. Undoing a 200-match replace should not
    // be 200 keystrokes.
    //
    // Applied back to front, because replacing text of a different length moves
    // everything after it — going forwards would invalidate every remaining
    // position as soon as the first replacement landed.
    const tr = editor.state.tr;
    for (const match of [...plugin.matches].reverse()) {
      tr.insertText(replacement, match.from, match.to);
    }
    editor.view.dispatch(tr);
  };

  if (!open) return null;

  return (
    <div
      role="search"
      aria-label="Find in document"
      className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          editor?.commands.focus();
        }
      }}
    >
      <input
        ref={field}
        value={needle}
        onChange={(event) => setNeedle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          goTo(state.current + (event.shiftKey ? -1 : 1));
        }}
        aria-label="Find"
        placeholder="Find"
        autoFocus
        className="h-7 w-full min-w-0 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none focus-visible:border-carmine-500 sm:w-44 sm:flex-none"
      />

      {/* Reported rather than left silent: after typing, nothing on screen is
          indistinguishable from a control that has stopped working. */}
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "min-w-16 text-xs",
          state.total === 0 && needle ? "text-carmine-600" : "text-neutral-500",
        )}
      >
        {needle === ""
          ? ""
          : state.total === 0
            ? "0 results"
            : `${state.current + 1} of ${state.total}`}
      </span>

      <span className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous match"
          disabled={state.total === 0}
          onClick={() => goTo(state.current - 1)}
        >
          ↑
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next match"
          disabled={state.total === 0}
          onClick={() => goTo(state.current + 1)}
        >
          ↓
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={matchCase}
          aria-label="Match case"
          title="Match case"
          onClick={() => setMatchCase((on) => !on)}
          className={cn(matchCase && "bg-carmine-50 text-carmine-700")}
        >
          Aa
        </Button>
      </span>

      {/* Replace writes the document, so it exists only for someone who may.
          A viewer and a commenter get find, which is the useful half, and no
          control that would 404. */}
      {canEdit && (
        <>
          {showReplace ? (
            <>
              <input
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                aria-label="Replace with"
                placeholder="Replace with"
                className="h-7 w-full min-w-0 rounded-md border border-neutral-200 bg-white px-2 text-sm outline-none focus-visible:border-carmine-500 sm:w-44 sm:flex-none"
              />
              <Button size="sm" variant="ghost" disabled={state.total === 0} onClick={replaceCurrent}>
                Replace
              </Button>
              <Button size="sm" variant="ghost" disabled={state.total === 0} onClick={replaceAll}>
                Replace all
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setShowReplace(true)}>
              Replace…
            </Button>
          )}
        </>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close find"
        onClick={() => {
          setOpen(false);
          editor?.commands.focus();
        }}
        className="ml-auto"
      >
        ✕
      </Button>
    </div>
  );
}
