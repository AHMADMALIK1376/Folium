import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { documentText, type TextRange } from "./anchors";

/** Finding text in the document, and putting something else there.
 *
 * The browser's own Ctrl+F is not an option: it searches rendered text, and in
 * an editor that is only what is laid out — it also cannot replace, and cannot
 * tell the editor where it landed. So this intercepts Ctrl+F, and having taken
 * it must be at least as good.
 *
 * Matches are drawn as ProseMirror decorations, the same mechanism comment
 * highlights use. A decoration is a view-layer overlay: searching a document
 * cannot change it, which is a guarantee rather than a convention.
 */

export interface SearchQuery {
  needle: string;
  matchCase: boolean;
}

/** Every place `needle` occurs in `haystack`.
 *
 * Literal, not regex — a find bar that accepts regex turns a stray `(` into an
 * error the user did not ask to debug, and this searches prose.
 *
 * Overlapping occurrences are not reported: searching "aa" in "aaa" finds one
 * match, not two, because the second would share characters with the first and
 * "replace all" on overlapping matches has no sane meaning.
 */
export function findMatches(haystack: string, query: SearchQuery): TextRange[] {
  if (!query.needle) return [];

  const text = query.matchCase ? haystack : haystack.toLowerCase();
  const needle = query.matchCase ? query.needle : query.needle.toLowerCase();
  const found: TextRange[] = [];

  let at = text.indexOf(needle);
  while (at !== -1) {
    found.push({ from: at, to: at + needle.length });
    at = text.indexOf(needle, at + needle.length);
  }

  return found;
}

/** Every match in the document, as positions the editor can act on. */
export function findInDocument(doc: PMNode, query: SearchQuery): TextRange[] {
  const { text, positions } = documentText(doc);

  return findMatches(text, query)
    .map(({ from, to }) => {
      // Block separators carry no position, so a match that begins or ends on
      // one starts at the first real character. A match made only of them is
      // not a match at all.
      let start = from;
      let end = to - 1;
      while (start <= end && positions[start] === -1) start += 1;
      while (end >= start && positions[end] === -1) end -= 1;
      if (start > end) return null;

      return { from: positions[start], to: positions[end] + 1 };
    })
    .filter((range): range is TextRange => range !== null);
}

interface State {
  /** Kept here rather than derived back out of the matches, which would lose
   *  `matchCase` and guess the needle from whatever the first hit happened to
   *  be. The plugin has to re-find after every document change, so it needs to
   *  remember what it was looking for. */
  query: SearchQuery | null;
  matches: TextRange[];
  current: number;
  decorations: DecorationSet;
}

export const findReplaceKey = new PluginKey<State>("findReplace");

/** Transaction meta carrying a new query, or null to clear it. */
export const SET_SEARCH = "setSearch";
/** Transaction meta carrying the index of the match to highlight as current. */
export const SET_CURRENT = "setSearchCurrent";

const EMPTY: State = {
  query: null,
  matches: [],
  current: 0,
  decorations: DecorationSet.empty,
};

export const FindReplace = Extension.create({
  name: "findReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: findReplaceKey,
        state: {
          init: () => EMPTY,
          apply(transaction, current, _old, newState) {
            const query = transaction.getMeta(SET_SEARCH) as SearchQuery | null | undefined;
            const index = transaction.getMeta(SET_CURRENT) as number | undefined;

            if (query === null) return EMPTY;

            const nothingChanged =
              query === undefined && index === undefined && !transaction.docChanged;
            if (nothingChanged) return current;

            const active = query ?? current.query;
            if (active === null) return EMPTY;

            // Re-found rather than mapped through the transaction. Replacing a
            // match changes the text every later match sits in, and mapping
            // would carry stale ranges forward — cheap here, and always right.
            const matches =
              query !== undefined || transaction.docChanged
                ? findInDocument(newState.doc, active)
                : current.matches;

            const at = clamp(index ?? current.current, matches.length);

            return {
              query: active,
              matches,
              current: at,
              decorations: decorate(newState.doc, matches, at),
            };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});

function clamp(index: number, length: number): number {
  if (length === 0) return 0;
  return ((index % length) + length) % length;
}

function decorate(doc: PMNode, matches: TextRange[], current: number): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        // The current match is styled apart from the rest: "3 of 17" is only
        // useful if you can see which one is 3.
        class: index === current ? "folium-find folium-find-current" : "folium-find",
      }),
    ),
  );
}
