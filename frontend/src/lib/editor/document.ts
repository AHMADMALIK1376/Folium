import type { Node as PMNode } from "@tiptap/pm/model";

import { documentText } from "./anchors";

/** What a document is, told three ways: its shape, its size, and its case.
 *
 * Everything here is a pure function of the document, computed on demand.
 * Nothing is stored, because nothing here is a fact about the document that the
 * document does not already contain.
 */

// ---------------------------------------------------------------- outline

export interface Heading {
  level: number;
  text: string;
  /** Where the heading starts, for scrolling to it. */
  pos: number;
}

/** Every heading, in document order.
 *
 * Word calls this the Navigation Pane, and it earns its space on exactly the
 * documents where scrolling has stopped working.
 */
export function outlineOf(doc: PMNode): Heading[] {
  const headings: Heading[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;

    headings.push({
      level: Number(node.attrs.level) || 1,
      // An empty heading is still a place in the document, so it gets a name
      // rather than an unclickable blank row.
      text: node.textContent.trim() || "Untitled heading",
      pos,
    });
    return false;
  });

  return headings;
}

// ------------------------------------------------------------- statistics

/** Words per minute for silent reading of prose.
 *
 * From Brysbaert's 2019 meta-analysis, which puts adult silent reading at about
 * 238 wpm. The number matters less than not inventing one: every "5 min read"
 * on the internet is someone's guess, and this one at least has a source. */
export const WORDS_PER_MINUTE = 238;

export interface Statistics {
  words: number;
  characters: number;
  /** Whole minutes, never zero — "0 min read" is not a thing anyone wants to be
   *  told, and a one-word document still takes a moment to open. */
  minutes: number;
}

/** Count the words in a string.
 *
 * Splitting on whitespace, which is how every word counter in the world
 * disagrees with every other. What matters here is that it runs on the same
 * plain text the backend's `doc_to_plain_text` produces, so the number the
 * editor shows and the text a search indexes are the same text.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function statisticsOf(doc: PMNode, range?: { from: number; to: number }): Statistics {
  const text =
    range && range.to > range.from
      ? doc.textBetween(range.from, range.to, "\n")
      : documentText(doc).text;

  const words = countWords(text);

  return {
    words,
    characters: text.length,
    minutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
  };
}

// ------------------------------------------------------------- change case

/** The words a title leaves in lower case.
 *
 * Articles, coordinating conjunctions and short prepositions — the set every
 * style guide agrees on, give or take. */
const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on",
  "or", "per", "the", "to", "v", "via", "vs",
]);

/** Title Case, the way a style guide means it.
 *
 * The naive version — capitalise every word — produces "The Rise And Fall Of
 * The Roman Empire", which looks wrong to everybody and right to nobody. Small
 * words stay lower **except** as the first or last word, which is the rule
 * that makes "To Be Or Not To Be" come out as "To Be or Not to Be".
 */
export function toTitleCase(text: string): string {
  // Split on whitespace but keep it, so the original spacing survives.
  const parts = text.split(/(\s+)/);
  const words = parts.filter((part) => !/^\s*$/.test(part));
  let seen = 0;

  return parts
    .map((part) => {
      if (/^\s*$/.test(part)) return part;

      seen += 1;
      const isEdge = seen === 1 || seen === words.length;
      const lower = part.toLowerCase();

      if (!isEdge && SMALL_WORDS.has(lower.replace(/[^a-z]/g, ""))) return lower;

      return lower.replace(/[a-z]/, (first) => first.toUpperCase());
    })
    .join("");
}

export function changeCase(text: string, to: "upper" | "lower" | "title"): string {
  switch (to) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return toTitleCase(text);
  }
}
