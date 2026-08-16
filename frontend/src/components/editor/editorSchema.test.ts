import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { baseExtensions } from "@/lib/editor/extensions";

/** Half of the contract that stops Phase 6-i's bug returning.
 *
 * `StarterKit` enabled blockquote, code blocks, inline code, strikethrough,
 * rules and hard breaks from Phase 1. They were absent from the toolbar, so they
 * looked like features Folium did not have — but they were reachable by
 * shortcut, by input rule and by paste, and the Markdown converter dropped every
 * one of them in silence. A document whose body was a quote exported as an empty
 * file.
 *
 * Nothing in either codebase asserted that the editor's schema and the converter
 * agreed. This test names what the editor allows; `backend/tests/test_editor_parity.py`
 * asserts the converter has a decision for each name. Enable a new extension and
 * this test fails until editor-schema.json is updated; update that file and the
 * backend test fails until the converter is taught what to do.
 */

const CONTRACT = JSON.parse(
  readFileSync(join(process.cwd(), "..", "editor-schema.json"), "utf-8"),
) as { nodes: string[]; marks: string[] };

/** The extensions DocumentEditor actually builds with — the same array, not a
 *  copy of it.
 *
 * This used to hold its own hardcoded list, which could drift from what the
 * editor really used and leave the contract policing something nobody rendered.
 * `baseExtensions` is now the single source both read.
 *
 * Collaboration and CollaborationCursor are deliberately outside it: they add no
 * nodes or marks of their own, only behaviour, so they cannot affect what a
 * document can contain.
 */
/** TipTap's own types describe `addExtensions` in terms of a live editor
 *  instance, which there is none of here — this reads the static bundle only.
 *  The shape is asserted by the tests below, which is the point of them. */
type ExtensionLike = {
  type: string;
  name: string;
  options?: unknown;
  config?: { addExtensions?: () => ExtensionLike[] };
};

function schemaNames() {
  const nodes: string[] = [];
  const marks: string[] = [];

  const extensions = baseExtensions({
    withHistory: true,
  }) as unknown as ExtensionLike[];

  for (const extension of extensions) {
    const bundle = extension.config?.addExtensions;
    const members =
      typeof bundle === "function"
        ? bundle.call({ options: extension.options ?? {}, ...extension })
        : [extension];

    for (const member of members) {
      if (member.type === "node") nodes.push(member.name);
      if (member.type === "mark") marks.push(member.name);
    }
  }

  return { nodes: nodes.sort(), marks: marks.sort() };
}

describe("the editor's schema contract", () => {
  it("matches the node list the converters are held to", () => {
    expect(schemaNames().nodes).toEqual([...CONTRACT.nodes].sort());
  });

  it("matches the mark list the converters are held to", () => {
    expect(schemaNames().marks).toEqual([...CONTRACT.marks].sort());
  });

  it("still allows the types that were silently dropped before Phase 6-i", () => {
    // Named individually so that removing one from StarterKit is a deliberate
    // act rather than something noticed later by a user losing a code sample.
    const { nodes, marks } = schemaNames();

    expect(nodes).toEqual(expect.arrayContaining(["blockquote", "codeBlock", "horizontalRule", "hardBreak"]));
    expect(marks).toEqual(expect.arrayContaining(["code", "strike"]));
  });
});
