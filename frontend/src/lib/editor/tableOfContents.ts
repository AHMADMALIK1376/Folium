import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { TableOfContentsView } from "@/components/editor/TableOfContentsView";

/** A table of contents, stored as a marker and drawn from the document.
 *
 * **It holds nothing.** An atom node with no content and no attributes: the
 * headings are read out of the document every time it renders, so there is
 * nothing to keep in step and nothing that can go stale. Storing the entries
 * would mean a contents list that quietly disagreed with the document the
 * moment anyone renamed a heading — which is exactly the failure Word's
 * "update field" prompt exists to paper over.
 *
 * That also makes the Markdown round trip trivial. The node carries no
 * information beyond "a contents list goes here", so it exports as
 * `<!-- toc -->` — the marker markdown-toc and its imitators already use — and
 * imports back to precisely itself. A node with stored entries would have had
 * to serialise a list of links and re-import it as a bullet list, which does
 * not round-trip and would have failed the parity contract.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: () => ReturnType;
    };
  }
}

export const TableOfContents = Node.create({
  name: "tableOfContents",

  group: "block",
  // Atom: it has no editable innards. Without this the caret can be placed
  // inside a thing that is generated, and typing there edits something the next
  // render throws away.
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: "div[data-toc]" }];
  },

  renderHTML() {
    return ["div", { "data-toc": "" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsView);
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});
