import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { locate, type Anchor } from "./anchors";

/** Drawing the passages comments are about — as decorations, never as marks.
 *
 * A decoration is a view-layer overlay: it changes what is painted and nothing
 * about the document. That is the whole reason commenting works at `comment`
 * permission, where a content write would be refused, and the reason a comment
 * cannot desynchronise a collaborative room or turn up in an export.
 *
 * It also means this extension contributes no nodes and no marks, so it is
 * deliberately not part of `baseExtensions` — that array is the schema contract
 * checked against editor-schema.json, and nothing here belongs in it.
 */

export interface CommentAnchor extends Anchor {
  id: string;
  resolved: boolean;
}

interface State {
  anchors: CommentAnchor[];
  decorations: DecorationSet;
}

export const commentHighlightsKey = new PluginKey<State>("commentHighlights");

/** Transaction meta key carrying a new set of anchors to draw. */
export const SET_COMMENT_ANCHORS = "setCommentAnchors";

interface Options {
  onSelect?: (commentId: string) => void;
}

export const CommentHighlights = Extension.create<Options>({
  name: "commentHighlights",

  addOptions() {
    return { onSelect: undefined };
  },

  addProseMirrorPlugins() {
    const { onSelect } = this.options;

    return [
      new Plugin<State>({
        key: commentHighlightsKey,
        state: {
          init: () => ({ anchors: [], decorations: DecorationSet.empty }),
          apply(transaction, current, _oldState, newState) {
            const incoming = transaction.getMeta(SET_COMMENT_ANCHORS) as
              | CommentAnchor[]
              | undefined;

            // Nothing new to draw and nothing moved: keep what is on screen.
            if (incoming === undefined && !transaction.docChanged) return current;

            // Recomputed rather than mapped through the transaction, because
            // these anchors are quotes rather than positions — there is nothing
            // to map, and re-finding them is exactly what keeps them right.
            const anchors = incoming ?? current.anchors;
            return { anchors, decorations: build(newState.doc, anchors) };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations;
          },
          handleClick(view, pos) {
            if (!onSelect) return false;

            const found = this.getState(view.state)?.decorations.find(pos, pos) ?? [];
            const id = found[0]?.spec?.commentId;
            if (typeof id !== "string") return false;

            onSelect(id);
            // Reported as unhandled on purpose: clicking a highlight opens its
            // thread *and* places the caret, which is what someone reading a
            // document expects a click to do.
            return false;
          },
        },
      }),
    ];
  },
});

function build(doc: PMNode, anchors: CommentAnchor[]): DecorationSet {
  const decorations: Decoration[] = [];

  for (const anchor of anchors) {
    if (!anchor.quote) continue;

    const range = locate(doc, anchor);
    // A detached comment draws nothing. Its passage is gone, and highlighting
    // the nearest plausible text would be a confident lie — the panel says it
    // detached instead.
    if (range === null) continue;

    decorations.push(
      Decoration.inline(
        range.from,
        range.to,
        {
          class: anchor.resolved ? "folium-comment folium-comment-resolved" : "folium-comment",
          "data-comment-id": anchor.id,
        },
        { commentId: anchor.id },
      ),
    );
  }

  return DecorationSet.create(doc, decorations);
}
