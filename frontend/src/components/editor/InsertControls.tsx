"use client";

import type { Editor } from "@tiptap/react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useState } from "react";

import {
  bookmarksIn,
  isValidBookmarkName,
  slugifyBookmark,
  type Bookmark,
} from "@/lib/editor/bookmarks";
import { formatOptions } from "@/lib/editor/dateTime";
import { SYMBOL_GROUPS, searchSymbols } from "@/lib/editor/symbols";

const TRIGGER =
  "flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-neutral-600 transition-colors " +
  "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-40";

const PANEL =
  "z-50 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg";

/** Keeps the editor's selection alive while a control is used.
 *
 * Every button here acts on the selection, and a plain click moves focus —
 * which collapses it before the command runs. Without this, "bookmark the
 * selected passage" bookmarks nothing.
 */
const keepSelection = (event: { preventDefault: () => void }) => event.preventDefault();

// ------------------------------------------------------------------ symbols

function SymbolPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = searchSymbols(query);
  const searching = query.trim() !== "";

  const insert = (char: string) => {
    editor.chain().focus().insertContent(char).run();
    setOpen(false);
    setQuery("");
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverPrimitive.Trigger
        aria-label="Symbol"
        title="Insert a symbol"
        onMouseDown={keepSelection}
        className={TRIGGER}
      >
        <span aria-hidden="true" className="text-sm">
          Ω
        </span>
        <span>Symbol</span>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} align="start" className={`${PANEL} w-72`}>
          <input
            type="search"
            aria-label="Search symbols"
            placeholder="Search — try x, ->, euro"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mb-2 w-full rounded-md border border-neutral-200 px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
          />

          <div className="max-h-64 overflow-y-auto">
            {searching ? (
              matches.length === 0 ? (
                <p className="px-1 py-2 text-xs text-neutral-500">
                  Nothing matching “{query.trim()}”.
                </p>
              ) : (
                <div role="group" aria-label="Search results" className="grid grid-cols-8 gap-0.5">
                  {matches.map((symbol) => (
                    <SymbolButton key={symbol.char} symbol={symbol} onPick={insert} />
                  ))}
                </div>
              )
            ) : (
              SYMBOL_GROUPS.map((group) => (
                <section key={group.name} className="mb-2">
                  <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                    {group.name}
                  </h3>
                  <div role="group" aria-label={group.name} className="grid grid-cols-8 gap-0.5">
                    {group.symbols.map((symbol) => (
                      <SymbolButton key={symbol.char} symbol={symbol} onPick={insert} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function SymbolButton({
  symbol,
  onPick,
}: {
  symbol: { char: string; name: string };
  onPick: (char: string) => void;
}) {
  return (
    <button
      type="button"
      // Named, not just drawn. A grid of bare glyphs is unusable with a screen
      // reader and unsearchable in a test.
      aria-label={symbol.name}
      title={`${symbol.name}  ${symbol.char}`}
      onMouseDown={keepSelection}
      onClick={() => onPick(symbol.char)}
      className="flex h-7 items-center justify-center rounded-md text-sm text-neutral-800 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
    >
      {symbol.char}
    </button>
  );
}

// ---------------------------------------------------------------- date/time

function DateTimeButton({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  // One Date for the whole menu, so the list cannot straddle midnight.
  const options = open ? formatOptions(new Date()) : [];

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-label="Date and time"
        title="Insert today's date"
        onMouseDown={keepSelection}
        className={TRIGGER}
      >
        Date &amp; time
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} align="start" className={`${PANEL} w-56`}>
          <div role="group" aria-label="Date formats" className="grid gap-0.5">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={keepSelection}
                onClick={() => {
                  editor.chain().focus().insertContent(option.text).run();
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-left text-xs text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
              >
                {option.text}
              </button>
            ))}
          </div>
          {/* Word offers "update automatically", which makes the date change
              under whoever opens the document next. Useful on a letterhead,
              quietly wrong on a dated record — so this says which it is. */}
          <p className="mt-2 border-t border-neutral-200 pt-1.5 text-[11px] text-neutral-500">
            Inserted as text. It will not change later.
          </p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ---------------------------------------------------------------- bookmarks

function BookmarkButton({
  editor,
  existing,
}: {
  editor: Editor;
  existing: Bookmark[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const hasSelection = !editor.state.selection.empty;
  const slug = slugifyBookmark(name);
  const taken = existing.some((bookmark) => bookmark.name === slug);
  const canAdd = isValidBookmarkName(name) && !taken;

  const add = () => {
    if (!canAdd) return;
    editor.chain().focus().setBookmark(name).run();
    setName("");
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setName("");
      }}
    >
      <PopoverPrimitive.Trigger
        aria-label="Bookmark"
        title={
          hasSelection
            ? "Name the selected passage"
            : "Select a passage first — a bookmark names one"
        }
        // A bookmark is a mark, so it needs something to mark. Disabled with a
        // tooltip that says why, rather than accepting the click and doing
        // nothing visible.
        disabled={!hasSelection}
        onMouseDown={keepSelection}
        className={TRIGGER}
      >
        Bookmark
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} align="start" className={`${PANEL} w-64`}>
          <label className="block text-xs text-neutral-600">
            <span className="mb-1 block font-semibold text-neutral-900">Bookmark name</span>
            <input
              autoFocus
              aria-label="Bookmark name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
              className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
            />
          </label>

          {/* Shown as it is typed, because the name is not kept verbatim — it
              has to survive being an id and a URL fragment. Discovering that
              after the fact would be worse than seeing it happen. */}
          {name.trim() !== "" && (
            <p className="mt-1 text-[11px] text-neutral-500">
              {slug === "" ? (
                <span className="text-carmine-700">
                  That leaves nothing to name the passage with.
                </span>
              ) : taken ? (
                <span className="text-carmine-700">
                  “{slug}” is already used in this document.
                </span>
              ) : (
                <>Saved as “{slug}”</>
              )}
            </p>
          )}

          <button
            type="button"
            disabled={!canAdd}
            onMouseDown={keepSelection}
            onClick={add}
            className="mt-2 w-full rounded-md bg-carmine-600 px-2 py-1 text-xs text-white transition-colors hover:bg-carmine-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add bookmark
          </button>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function CrossReferenceButton({
  editor,
  bookmarks,
}: {
  editor: Editor;
  bookmarks: Bookmark[];
}) {
  const [open, setOpen] = useState(false);

  const insert = (bookmark: Bookmark) => {
    // A cross-reference is an ordinary link to "#name". That is the whole
    // implementation: no node, no mark, no converter work — and it exports as
    // "[text](#name)" because that is what a link does.
    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text: bookmark.text || bookmark.name,
        marks: [{ type: "link", attrs: { href: `#${bookmark.name}` } }],
      })
      // Otherwise the link mark stays active and the next word typed joins it.
      .unsetMark("link")
      .run();
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-label="Cross-reference"
        title={
          bookmarks.length === 0
            ? "Add a bookmark first — a cross-reference points at one"
            : "Link to a bookmark"
        }
        disabled={bookmarks.length === 0}
        onMouseDown={keepSelection}
        className={TRIGGER}
      >
        Cross-reference
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} align="start" className={`${PANEL} w-64`}>
          <div role="group" aria-label="Bookmarks" className="grid gap-0.5">
            {bookmarks.map((bookmark) => (
              <button
                key={bookmark.name}
                type="button"
                onMouseDown={keepSelection}
                onClick={() => insert(bookmark)}
                className="rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
              >
                <span className="block text-neutral-800">{bookmark.text || bookmark.name}</span>
                <span className="block text-[11px] text-neutral-400">#{bookmark.name}</span>
              </button>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ------------------------------------------------------------------- insert

/** The Insert row: things that go *into* a document rather than change how it
 *  reads.
 *
 * Everything here is cheap by design. Symbols and dates insert plain text, so
 * they touch neither the editor's schema nor the Markdown converters. A
 * cross-reference is a link. Only the bookmark and the table of contents needed
 * a schema entry, and each earns it by expressing something nothing else can.
 */
export function InsertControls({ editor }: { editor: Editor }) {
  const bookmarks = bookmarksIn(editor.state.doc);

  return (
    <div
      role="toolbar"
      aria-label="Insert"
      data-print-hide
      className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 px-2 py-1.5 [scrollbar-width:thin] sm:flex-wrap sm:overflow-x-visible"
    >
      <SymbolPicker editor={editor} />
      <DateTimeButton editor={editor} />

      <span aria-hidden="true" className="mx-1 h-5 w-px bg-neutral-200" />

      <BookmarkButton editor={editor} existing={bookmarks} />
      <CrossReferenceButton editor={editor} bookmarks={bookmarks} />

      <span aria-hidden="true" className="mx-1 h-5 w-px bg-neutral-200" />

      <button
        type="button"
        aria-label="Table of contents"
        title="Insert a table of contents"
        onMouseDown={keepSelection}
        onClick={() => editor.chain().focus().insertTableOfContents().run()}
        className={TRIGGER}
      >
        Contents
      </button>
    </div>
  );
}
