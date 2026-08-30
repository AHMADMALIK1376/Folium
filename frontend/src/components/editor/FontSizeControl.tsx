"use client";

import type { Editor } from "@tiptap/react";

import { DEFAULT_FONT_SIZE, FONT_SIZES, nextFontSize, parseFontSize } from "@/lib/editor/fontSize";

const STEP_BUTTON =
  "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-1 text-neutral-600 transition-colors " +
  "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none";

/** Size, as a list plus two nudges.
 *
 * Both halves earn their place. The list is how you get to 24 in one action;
 * the nudges are how you find the size that looks right without knowing its
 * number, which is what people actually do when a heading is nearly correct.
 */
export function FontSizeControl({ editor }: { editor: Editor }) {
  const stored = editor.getAttributes("textStyle").fontSize as string | undefined;
  const current = parseFontSize(stored);

  const step = (direction: 1 | -1) =>
    editor
      .chain()
      .focus()
      .setFontSize(nextFontSize(current, direction))
      .run();

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <label className="flex shrink-0 items-center">
        <span className="sr-only">Font size</span>
        <select
          aria-label="Font size"
          // An unsized selection shows the document's own size rather than an
          // empty box. It is what the text measures on screen, so showing
          // nothing would be less true, not more careful.
          value={current ?? DEFAULT_FONT_SIZE}
          onChange={(event) =>
            editor.chain().focus().setFontSize(Number(event.target.value)).run()
          }
          className="h-7 rounded-md border border-neutral-200 bg-white px-1.5 text-xs text-neutral-700 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
        >
          {/* A size an imported document brought with it is offered too, so
              selecting it is possible and the box never shows a value that is
              not in its own list. */}
          {(current !== null && !FONT_SIZES.includes(current)
            ? [...FONT_SIZES, current].sort((a, b) => a - b)
            : FONT_SIZES
          ).map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        aria-label="Grow font"
        title="Grow font"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => step(1)}
        className={STEP_BUTTON}
      >
        <span aria-hidden="true" className="text-sm font-semibold">
          A˄
        </span>
      </button>
      <button
        type="button"
        aria-label="Shrink font"
        title="Shrink font"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => step(-1)}
        className={STEP_BUTTON}
      >
        <span aria-hidden="true" className="text-xs font-semibold">
          A˅
        </span>
      </button>
    </div>
  );
}
