import type { TipTapDoc } from "@/lib/api/types";

/** Formatting this document carries that a Markdown file cannot.
 *
 * Kept in step with `lossy` in editor-schema.json, and with the backend
 * converter that drops these on export.
 *
 * The point of computing it is that the loss must never be silent. Phase 6
 * spent three separate bugs on content disappearing from an export without
 * anyone being told; accepting a lossy format is only defensible if the person
 * pressing the button knows before they press it.
 */
export function lossyFormattingIn(doc: unknown): string[] {
  const found = new Set<string>();

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;

    const record = node as {
      attrs?: Record<string, unknown>;
      marks?: { type?: string; attrs?: Record<string, unknown> }[];
      content?: unknown[];
    };

    if (record.attrs?.textAlign) found.add("alignment");

    for (const mark of record.marks ?? []) {
      // A highlight itself travels fine -- it exports as <mark>. Its colour
      // does not, so a yellow and a pink highlight come back identical. That
      // is a real loss and has to be named, or the warning is a lie by
      // omission.
      if (mark?.type === "highlight" && mark.attrs?.color) found.add("highlight colour");

      if (mark?.type !== "textStyle") continue;
      if (mark.attrs?.color) found.add("colour");
      if (mark.attrs?.fontSize) found.add("text size");
      if (mark.attrs?.fontFamily) found.add("fonts");
    }

    for (const child of record.content ?? []) walk(child);
  };

  walk(doc as TipTapDoc);

  // A stable order, so the sentence reads the same way every time rather than
  // reshuffling with whatever the document happened to contain first.
  return ["colour", "highlight colour", "text size", "fonts", "alignment"].filter((name) =>
    found.has(name),
  );
}

/** The warning sentence, or null when there is nothing to warn about. */
export function lossyWarning(doc: unknown): string | null {
  const kinds = lossyFormattingIn(doc);
  if (kinds.length === 0) return null;

  const list =
    kinds.length === 1
      ? kinds[0]
      : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`;

  return `Markdown cannot carry ${list}, so the .md file will not include it. Print or save as PDF to keep everything.`;
}
