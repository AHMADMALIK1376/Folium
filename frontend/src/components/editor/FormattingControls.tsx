"use client";

import type { Editor } from "@tiptap/react";

/** Colours offered for text.
 *
 * A fixed palette rather than a colour picker, deliberately. A picker invites
 * every shade of grey on a white page, and none of these fail contrast against
 * it — a document nobody can read is not more expressive.
 */
const COLOURS = [
  { label: "Default", value: null },
  { label: "Carmine", value: "#b01a20" },
  { label: "Amber", value: "#a16207" },
  { label: "Green", value: "#15803d" },
  { label: "Blue", value: "#1d4ed8" },
  { label: "Purple", value: "#6d28d9" },
  { label: "Grey", value: "#52525b" },
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

const ALIGNMENTS = [
  { label: "Align left", value: "left", glyph: "≡" },
  { label: "Align centre", value: "center", glyph: "≡" },
  { label: "Align right", value: "right", glyph: "≡" },
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

/** Colour, font and alignment — the formatting Markdown cannot carry.
 *
 * Grouped into their own row rather than mixed with the marks above, because
 * they behave differently on export: everything in the main toolbar survives a
 * Markdown round trip and none of this does. The export dialog says so before
 * writing a file, and PDF keeps all of it.
 */
export function FormattingControls({ editor }: { editor: Editor }) {
  const colour = (editor.getAttributes("textStyle").color as string) ?? "";
  const font = (editor.getAttributes("textStyle").fontFamily as string) ?? "";

  return (
    <div
      role="toolbar"
      aria-label="Text style"
      data-print-hide
      className="flex items-center gap-2 overflow-x-auto border-b border-neutral-200 px-2 py-1.5 [scrollbar-width:thin] sm:flex-wrap sm:overflow-x-visible"
    >
      <Select
        label="Text colour"
        value={colour}
        options={COLOURS}
        onChange={(value) =>
          value
            ? editor.chain().focus().setColor(value).run()
            : editor.chain().focus().unsetColor().run()
        }
      />
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
            "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-1.5 text-sm transition-colors " +
            "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none " +
            (editor.isActive({ textAlign: alignment.value })
              ? "bg-neutral-100 font-semibold text-carmine-700"
              : "text-neutral-600")
          }
        >
          <span
            className={
              alignment.value === "center"
                ? "block text-center"
                : alignment.value === "right"
                  ? "block text-right"
                  : "block text-left"
            }
            style={{ width: "1em" }}
          >
            {alignment.glyph}
          </span>
        </button>
      ))}
    </div>
  );
}
