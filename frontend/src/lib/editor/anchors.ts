import type { Node as PMNode } from "@tiptap/pm/model";

/** Finding the passage a comment is about, after the document has moved on.
 *
 * A comment's anchor is a **text quote selector** — the quoted text plus a
 * little of what surrounded it — and never a mark in the document. A mark would
 * be a content write, and the `comment` permission exists precisely for someone
 * who may not write content. Offsets drift on any edit above them. Yjs relative
 * positions would be ideal and only exist when collaboration is configured,
 * which is optional here.
 *
 * So the passage is found by looking for it, and when it can no longer be found
 * the comment says so rather than reattaching somewhere plausible.
 */

export interface Anchor {
  quote: string;
  prefix: string | null;
  suffix: string | null;
}

export interface TextRange {
  from: number;
  to: number;
}

/** How much context to keep either side of a quote.
 *
 * Enough to tell repeated phrases apart, short enough that editing a
 * neighbouring sentence does not cost the anchor: context is a tie-breaker
 * here, never a requirement. */
export const CONTEXT_LENGTH = 60;

/** The document's plain text, with the position of every character.
 *
 * `positions[i]` is the ProseMirror position of `text[i]`, or -1 for the
 * separators inserted between blocks — those are not characters in the
 * document and nothing can be anchored to them.
 *
 * Written out rather than using `doc.textBetween`, because the same function
 * has to serve both ends: the text a quote is captured from and the text it is
 * later searched in. One walker means they cannot disagree.
 */
export function documentText(doc: PMNode): { text: string; positions: number[] } {
  let text = "";
  const positions: number[] = [];
  let pendingSeparator = false;

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      if (pendingSeparator && text.length > 0) {
        text += "\n";
        positions.push(-1);
      }
      pendingSeparator = false;

      for (let i = 0; i < node.text.length; i += 1) {
        text += node.text[i];
        positions.push(pos + i);
      }
      return false;
    }

    if (node.isBlock && text.length > 0) pendingSeparator = true;
    return true;
  });

  return { text, positions };
}

/** The length of the longest common suffix of `a` and `b`. */
function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}

/** The length of the longest common prefix of `a` and `b`. */
function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

/** Where in `text` the anchor's quote is, or null if it is no longer there.
 *
 * Every occurrence is scored by how much of the recorded context still
 * surrounds it, and the best-scoring one wins — so quoting "the same" in a
 * document that says it four times still lands on the right one, and keeps
 * landing there when three of the four are edited.
 *
 * Ties go to the earliest occurrence. That is arbitrary, and it is better than
 * being arbitrary differently on each render.
 */
export function findQuote(text: string, anchor: Anchor): { start: number; end: number } | null {
  const quote = anchor.quote;
  if (!quote) return null;

  let best: { start: number; score: number } | null = null;

  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) {
    const before = commonSuffix(anchor.prefix ?? "", text.slice(0, i));
    const after = commonPrefix(anchor.suffix ?? "", text.slice(i + quote.length));
    const score = before + after;

    if (best === null || score > best.score) best = { start: i, score };
  }

  return best === null ? null : { start: best.start, end: best.start + quote.length };
}

/** The document range an anchor points at, or null if its passage is gone.
 *
 * Null is a real answer, not a failure. The comment is still shown, marked as
 * detached, with the text it was about — losing a highlight is recoverable,
 * pointing confidently at the wrong paragraph is not.
 */
export function locate(doc: PMNode, anchor: Anchor): TextRange | null {
  const { text, positions } = documentText(doc);
  const found = findQuote(text, anchor);
  if (found === null) return null;

  // Skip past any block separators at either edge: they have no position, so a
  // quote that begins or ends on one starts at the first real character.
  let start = found.start;
  let end = found.end - 1;
  while (start <= end && positions[start] === -1) start += 1;
  while (end >= start && positions[end] === -1) end -= 1;
  if (start > end) return null;

  return { from: positions[start], to: positions[end] + 1 };
}

/** Describe a selection as an anchor: what it says, and what surrounds it. */
export function describeSelection(doc: PMNode, from: number, to: number): Anchor | null {
  const { text, positions } = documentText(doc);

  let start = -1;
  let end = -1;
  for (let i = 0; i < positions.length; i += 1) {
    const pos = positions[i];
    if (pos === -1) continue;
    if (pos >= from && pos < to) {
      if (start === -1) start = i;
      end = i;
    }
  }

  if (start === -1) return null;

  return {
    quote: text.slice(start, end + 1),
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end + 1, end + 1 + CONTEXT_LENGTH),
  };
}
