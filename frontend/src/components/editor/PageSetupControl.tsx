"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import { useState } from "react";

import {
  MARGIN_PRESETS,
  MAX_MARGIN_IN,
  MIN_MARGIN_IN,
  PAGE_SIZE_LABELS,
  parseMargin,
  presetNameFor,
  type Margins,
  type Orientation,
  type PageSetup,
  type PageSize,
} from "@/lib/editor/pageSetup";

const EDGES: { key: keyof Margins; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
];

/** A small drawing of a page with its margins, at the proportions given.
 *
 * Word puts one beside every preset, and it earns its place: "Moderate" and
 * "Office 2003 Default" are four numbers apart and the picture is the only
 * thing in the row that says which is wider.
 */
function MarginPreview({ margins }: { margins: Margins }) {
  const inset = (value: number) => `${Math.min(40, (value / 3) * 40)}%`;

  return (
    <span
      aria-hidden="true"
      className="relative block h-8 w-6 shrink-0 border border-neutral-400 bg-white"
    >
      <span
        className="absolute border border-dashed border-neutral-400"
        style={{
          top: inset(margins.top),
          bottom: inset(margins.bottom),
          left: inset(margins.left),
          right: inset(margins.right),
        }}
      />
    </span>
  );
}

/**
 * Page size, orientation and margins.
 *
 * Laid out like Word's Layout tab because that is what it is copying, and
 * because the presets are the point: almost nobody wants a number, they want
 * "narrower than that".
 *
 * The custom fields commit on blur rather than on every keystroke. Typing "0.7"
 * passes through "0." and "0", both of which are legal margins, and saving each
 * one would redraw the page twice on the way to the value actually wanted --
 * and send two writes that were never intended.
 */
export function PageSetupControl({
  setup,
  onChange,
  disabled = false,
}: {
  setup: PageSetup;
  onChange: (next: PageSetup) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const activePreset = presetNameFor(setup.margins);

  const commitMargin = (edge: keyof Margins, raw: string) => {
    const parsed = parseMargin(raw);
    // A field left unreadable keeps the value it had. Refusing silently is
    // right here: the number is still on screen, so nothing is lost and there
    // is nothing to explain.
    if (parsed !== null && parsed !== setup.margins[edge]) {
      onChange({ ...setup, margins: { ...setup.margins, [edge]: parsed } });
    }
    setDraft((current) => {
      const next = { ...current };
      delete next[edge];
      return next;
    });
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        disabled={disabled}
        aria-label="Page setup"
        title="Page size, orientation and margins"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none disabled:opacity-50"
      >
        <MarginPreview margins={setup.margins} />
        <span>
          {PAGE_SIZE_LABELS[setup.size]} · {activePreset ?? "Custom"}
        </span>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={6}
          align="start"
          className="z-50 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg"
        >
          <fieldset className="mb-3">
            <legend className="mb-1 text-xs font-semibold text-neutral-900">Paper</legend>
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="sr-only">Page size</span>
                <select
                  aria-label="Page size"
                  value={setup.size}
                  onChange={(event) =>
                    onChange({ ...setup, size: event.target.value as PageSize })
                  }
                  className="h-7 w-full rounded-md border border-neutral-200 bg-white px-1.5 text-xs text-neutral-700 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
                >
                  {Object.entries(PAGE_SIZE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <span className="sr-only">Orientation</span>
                <select
                  aria-label="Orientation"
                  value={setup.orientation}
                  onChange={(event) =>
                    onChange({
                      ...setup,
                      orientation: event.target.value as Orientation,
                    })
                  }
                  className="h-7 w-full rounded-md border border-neutral-200 bg-white px-1.5 text-xs text-neutral-700 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="mb-3">
            <legend className="mb-1 text-xs font-semibold text-neutral-900">Margins</legend>
            <div role="group" aria-label="Margin presets" className="grid gap-0.5">
              {MARGIN_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  aria-pressed={activePreset === preset.name}
                  onClick={() => onChange({ ...setup, margins: { ...preset.margins } })}
                  className={
                    "flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors " +
                    "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none " +
                    (activePreset === preset.name
                      ? "bg-neutral-100 font-semibold text-carmine-700"
                      : "text-neutral-700")
                  }
                >
                  <MarginPreview margins={preset.margins} />
                  <span className="flex-1">{preset.name}</span>
                  <span className="text-neutral-400">
                    {preset.margins.top}&quot; / {preset.margins.left}&quot;
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-neutral-900">
              Custom, in inches
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {EDGES.map((edge) => (
                <label key={edge.key} className="flex items-center gap-1.5 text-xs">
                  <span className="w-12 text-neutral-500">{edge.label}</span>
                  <input
                    type="number"
                    aria-label={`${edge.label} margin`}
                    min={MIN_MARGIN_IN}
                    max={MAX_MARGIN_IN}
                    step={0.25}
                    value={draft[edge.key] ?? String(setup.margins[edge.key])}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [edge.key]: event.target.value }))
                    }
                    onBlur={(event) => commitMargin(edge.key, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="w-full min-w-0 rounded-md border border-neutral-200 px-1.5 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
                  />
                </label>
              ))}
            </div>
          </fieldset>

          {/* Said once, here, rather than discovered when a printed page does
              not match. Mirrored margins are absent for the same reason. */}
          <p className="mt-3 border-t border-neutral-200 pt-2 text-[11px] leading-snug text-neutral-500">
            The page width and margins are what you will print. Folium does not
            split a document into numbered pages on screen — a browser lays text
            out as one continuous flow.
          </p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
