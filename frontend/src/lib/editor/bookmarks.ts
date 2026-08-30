import { Mark, mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/** Named places in a document, and the references that point at them.
 *
 * **A cross-reference is a link, not a second mark.** Word treats them as
 * separate objects; here a reference to a bookmark called `methods` is an
 * ordinary `link` whose href is `#methods`, which means it needs no schema
 * entry, no converter work, and no parity contract of its own — and it already
 * exports as Markdown correctly, because `[see Methods](#methods)` is just a
 * link. Adding a `crossReference` mark would have bought nothing but a second
 * thing to keep in step.
 *
 * The bookmark itself does need a mark, because "this passage is called
 * `methods`" is not expressible any other way.
 */

/** Characters an anchor may safely hold.
 *
 * A bookmark name ends up in an `id` attribute and in a URL fragment, so it has
 * to survive both. Rather than escaping at every use, the name is restricted at
 * the point it is created: lowercase, digits and hyphens.
 */
export function slugifyBookmark(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 64)
      // Trimmed AFTER the truncation, not before. Cutting at 64 characters can
      // land mid-separator and leave a hyphen hanging off the end, which every
      // other case here is careful to avoid -- a test caught exactly that.
      .replace(/^-+|-+$/g, "")
  );
}

/** Whether a name can be used at all.
 *
 * Rejects the empty result rather than generating one, so "!!!" is refused with
 * a message instead of silently becoming a bookmark called "" that nothing can
 * link to.
 */
export function isValidBookmarkName(name: string): boolean {
  return slugifyBookmark(name) !== "";
}

export type Bookmark = { name: string; text: string; pos: number };

/** Every bookmark in the document, in document order.
 *
 * Read out of the document rather than tracked alongside it, for the same
 * reason the table of contents is: there is nothing here the document does not
 * already contain, so there is nothing to keep in step.
 *
 * A bookmark spanning several text nodes — which happens as soon as one word
 * inside it is bold — yields one entry, not one per fragment. Without that, a
 * cross-reference picker lists "Methods" three times and the person choosing
 * cannot tell which is which.
 */
export function bookmarksIn(doc: PMNode): Bookmark[] {
  const found: Bookmark[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) return true;

    const mark = node.marks.find((candidate) => candidate.type.name === "bookmark");
    if (!mark) return true;

    const name = String(mark.attrs.name ?? "");
    if (name === "") return true;

    const previous = found[found.length - 1];
    // Adjacent fragments of the same bookmark are one bookmark. Compared by
    // name rather than by position, because the fragments are contiguous by
    // construction: a second bookmark of the same name elsewhere is a
    // duplicate, and duplicates are refused when they are created.
    if (previous && previous.name === name) {
      previous.text += node.text ?? "";
      return true;
    }

    found.push({ name, text: node.text ?? "", pos });
    return true;
  });

  return found.map((bookmark) => ({ ...bookmark, text: bookmark.text.trim() }));
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bookmark: {
      setBookmark: (name: string) => ReturnType;
      unsetBookmark: () => ReturnType;
    };
  }
}

export const BookmarkMark = Mark.create({
  name: "bookmark",

  // A bookmark names a passage; it does not change how that passage reads. It
  // must therefore survive alongside every other mark rather than replacing
  // one, which is the default for marks but worth being explicit about.
  inclusive: false,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("id"),
        renderHTML: (attributes) => {
          const name = attributes.name as string | null;
          return name ? { id: name } : {};
        },
      },
    };
  },

  parseHTML() {
    // `a[id]` without an href: an anchor that goes nowhere and only names a
    // place. An `a[href]` is a link, and must stay one.
    return [{ tag: "a[id]:not([href])" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, { class: "folium-bookmark" }), 0];
  },

  addCommands() {
    return {
      setBookmark:
        (name: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { name: slugifyBookmark(name) }),

      unsetBookmark:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
