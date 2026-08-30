"use client";

import type { Editor } from "@tiptap/react";

import { ColourPalette, type Swatch } from "./ColourPalette";
import { FontSizeControl } from "./FontSizeControl";

/** Colours offered for text.
 *
 * A fixed palette rather than a colour picker, deliberately. A picker invites
 * every shade of grey on a white page, and none of these fail contrast against
 * it — a document nobody can read is not more expressive.
 */
const TEXT_COLOURS: Swatch[] = [
  { label: "Black", value: "#18181b" },
  { label: "Grey", value: "#52525b" },
  { label: "Carmine", value: "#b01a20" },
  { label: "Orange", value: "#c2410c" },
  { label: "Amber", value: "#a16207" },
  { label: "Green", value: "#15803d" },
  { label: "Teal", value: "#0f766e" },
  { label: "Blue", value: "#1d4ed8" },
  { label: "Indigo", value: "#4338ca" },
  { label: "Purple", value: "#6d28d9" },
  { label: "Magenta", value: "#a21caf" },
  { label: "Brown", value: "#78350f" },
];

/** Colours offered for highlight.
 *
 * Pale where the text colours are dark, and for the opposite reason: this one
 * goes *behind* black text, so a strong colour here is the unreadable choice.
 *
 * This palette is the only Highlight control. There was briefly a second one --
 * a plain toggle in the Formatting row that applied a fixed yellow -- and two
 * buttons with the same name doing different things is worse than one button
 * that costs an extra click. Yellow is the first swatch for that reason.
 */
const HIGHLIGHT_COLOURS: Swatch[] = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Lime", value: "#d9f99d" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Teal", value: "#99f6e4" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Indigo", value: "#c7d2fe" },
  { label: "Purple", value: "#e9d5ff" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Red", value: "#fecaca" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Grey", value: "#e4e4e7" },
  { label: "Sand", value: "#e7e5e4" },
];

/** Fonts, by role rather than by name.
 *
 * Only stacks every platform already has. A webfont would be a network request
 * and a licence question for something a document editor can do without.
 */
const FONTS = [
  { label: "Default", value: null },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Sans", value: "Inter, system-ui, sans-serif" },
  { label: "Mono", value: "ui-monospace, 'Cascadia Code', monospace" },
];

/** The four alignments, each drawn as the shape it produces.
 *
 * Justify is the one people miss, and it is the reason a body of text can be
 * made to look like a printed page rather than a web page.
 */
const ALIGNMENTS = [
  { label: "Align left", value: "left", bars: ["100%", "60%", "100%", "60%"] },
  { label: "Align centre", value: "center", bars: ["100%", "70%", "100%", "70%"] },
  { label: "Align right", value: "right", bars: ["100%", "60%", "100%", "60%"] },
  { label: "Justify", value: "justify", bars: ["100%", "100%", "100%", "100%"] },
];

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string | null }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="flex shrink-0 items-center">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-7 rounded-md border border-neutral-200 bg-white px-1.5 text-xs text-neutral-700 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none"
      >
        {options.map((option) => (
          <option key={option.label} value={option.value ?? ""}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Four little bars in the shape of the alignment they stand for.
 *
 * The previous icon was the same "≡" glyph four times over with a text-align
 * on it, which drew an identical symbol in every button — the control said
 * what it did only in its tooltip.
 */
function AlignIcon({ bars, align }: { bars: string[]; align: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex w-4 flex-col gap-[2px]"
      style={{
        alignItems:
          align === "center" ? "center" : align === "right" ? "flex-end" : "stretch",
      }}
    >
      {bars.map((width, index) => (
        <span
          key={index}
          className="block h-[2px] rounded-full bg-current"
          style={{ width }}
        />
      ))}
    </span>
  );
}

/** Colour, size, font and alignment — the formatting Markdown cannot carry.
 *
 * Grouped into their own row rather than mixed with the marks above, because
 * they behave differently on export: everything in the main toolbar survives a
 * Markdown round trip and none of this does. The export dialog says so before
 * writing a file, and PDF keeps all of it.
 */
export function FormattingControls({ editor }: { editor: Editor }) {
  const colour = (editor.getAttributes("textStyle").color as string | undefined) ?? null;
  const highlight = (editor.getAttributes("highlight").color as string | undefined) ?? null;
  const font = (editor.getAttributes("textStyle").fontFamily as string) ?? "";

  return (
    <div
      role="toolbar"
      aria-label="Text style"
      data-print-hide
      className="flex items-center gap-2 overflow-x-auto border-b border-neutral-200 px-2 py-1.5 [scrollbar-width:thin] sm:flex-wrap sm:overflow-x-visible"
    >
      <FontSizeControl editor={editor} />

      <Select
        label="Font"
        value={font}
        options={FONTS}
        onChange={(value) =>
          value
            ? editor.chain().focus().setFontFamily(value).run()
            : editor.chain().focus().unsetFontFamily().run()
        }
      />

      <span aria-hidden="true" className="mx-1 h-5 w-px bg-neutral-200" />

      <ColourPalette
        label="Text colour"
        glyph="A"
        swatches={TEXT_COLOURS}
        value={colour}
        onPick={(value) =>
          value
            ? editor.chain().focus().setColor(value).run()
            : editor.chain().focus().unsetColor().run()
        }
      />
      <ColourPalette
        label="Highlight"
        glyph="▨"
        swatches={HIGHLIGHT_COLOURS}
        value={highlight}
        onPick={(value) =>
          value
            ? editor.chain().focus().setHighlight({ color: value }).run()
            : editor.chain().focus().unsetHighlight().run()
        }
      />

      <span aria-hidden="true" className="mx-1 h-5 w-px bg-neutral-200" />

      {ALIGNMENTS.map((alignment) => (
        <button
          key={alignment.value}
          type="button"
          aria-label={alignment.label}
          aria-pressed={editor.isActive({ textAlign: alignment.value })}
          title={alignment.label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().setTextAlign(alignment.value).run()}
          className={
            "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-1.5 transition-colors " +
            "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none " +
            (editor.isActive({ textAlign: alignment.value })
              ? "bg-neutral-100 text-carmine-700"
              : "text-neutral-600")
          }
        >
          <AlignIcon bars={alignment.bars} align={alignment.value} />
        </button>
      ))}
    </div>
  );
}
