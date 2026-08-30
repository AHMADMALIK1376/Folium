"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import { useState } from "react";

export type Swatch = { label: string; value: string };

/**
 * A grid of colours, opened from a toolbar button.
 *
 * This replaced a `<select>`. The select was smaller and worked, and it was
 * also the wrong control: choosing a colour from a list of the *words* for
 * colours means reading "Amber" and imagining it. Every editor worth copying
 * shows the colour itself, because that is the thing being chosen.
 *
 * The palette stays fixed rather than opening a full picker. Every swatch here
 * is legible on white; a picker invites pale yellow on a white page, and a
 * document nobody can read is not more expressive. That is a deliberate limit,
 * not a missing feature.
 */
export function ColourPalette({
  label,
  glyph,
  swatches,
  value,
  onPick,
}: {
  label: string;
  /** Shown in the trigger, underlined in whatever is currently chosen. */
  glyph: string;
  swatches: Swatch[];
  value: string | null;
  onPick: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const choose = (next: string | null) => {
    onPick(next);
    // Closed on choosing, because picking a colour is a single decision and
    // leaving it open covers the text you just changed.
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-label={label}
        title={label}
        // Keeps the selection alive. Without this the editor loses focus on
        // mousedown, the selection collapses, and the colour lands on nothing.
        onMouseDown={(event) => event.preventDefault()}
        className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
      >
        <span aria-hidden="true" className="font-semibold">
          {glyph}
        </span>
        <span
          aria-hidden="true"
          className="block h-1 w-4 rounded-full border border-neutral-300"
          style={{ backgroundColor: value ?? "transparent" }}
        />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <div role="group" aria-label={label} className="grid grid-cols-4 gap-1">
            {swatches.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                aria-label={swatch.label}
                aria-pressed={value === swatch.value}
                title={swatch.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(swatch.value)}
                className={
                  "h-6 w-6 rounded-md border transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none " +
                  (value === swatch.value
                    ? "border-neutral-900 ring-1 ring-neutral-900"
                    : "border-neutral-300")
                }
                style={{ backgroundColor: swatch.value }}
              />
            ))}
          </div>

          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(null)}
            className="mt-2 w-full rounded-md px-2 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
          >
            {/* Named for what it does, not "None" — the text does not become
                colourless, it goes back to the document's own colour. */}
            Remove {label.toLowerCase()}
          </button>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
