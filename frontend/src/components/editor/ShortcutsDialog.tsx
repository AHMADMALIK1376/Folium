"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** What the editor responds to.
 *
 * Not really a feature — an admission. An editor with thirty shortcuts and no
 * list of them has thirty secrets, and the person most likely to want the list
 * is the one already typing fast enough to benefit.
 *
 * `mod` is Ctrl everywhere except a Mac, where it is ⌘. Written that way rather
 * than detected, because a list that quietly shows the wrong key on half the
 * machines is worse than one that explains itself once.
 */
const GROUPS: { heading: string; items: [string, string][] }[] = [
  {
    heading: "Text",
    items: [
      ["Mod + B", "Bold"],
      ["Mod + I", "Italic"],
      ["Mod + U", "Underline"],
      ["Mod + Shift + S", "Strikethrough"],
      ["Mod + E", "Inline code"],
      ["Mod + Shift + H", "Highlight"],
    ],
  },
  {
    heading: "Blocks",
    items: [
      ["Mod + Alt + 1…3", "Heading 1 to 3"],
      ["Mod + Alt + 0", "Paragraph"],
      ["Mod + Shift + 8", "Bulleted list"],
      ["Mod + Shift + 7", "Numbered list"],
      ["Mod + Shift + 9", "Checklist"],
      ["Mod + Shift + B", "Quote"],
      ["Mod + Alt + C", "Code block"],
      ["/", "Insert menu, on an empty line"],
    ],
  },
  {
    heading: "Finding and editing",
    items: [
      ["Mod + F", "Find"],
      ["Mod + H", "Find and replace"],
      ["Enter / Shift + Enter", "Next / previous match"],
      ["Escape", "Close find"],
      ["Mod + Z", "Undo"],
      ["Mod + Shift + Z", "Redo"],
      ["Mod + K", "Link"],
    ],
  },
  {
    heading: "Typing shortcuts",
    items: [
      ["# ", "Heading"],
      ["- or * ", "Bulleted list"],
      ["1. ", "Numbered list"],
      ["> ", "Quote"],
      ["``` ", "Code block"],
      ["---", "Divider"],
    ],
  },
];

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Keyboard shortcuts">
          Shortcuts
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Mod is Ctrl on Windows and Linux, ⌘ on a Mac.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[60vh] gap-4 overflow-y-auto">
          {GROUPS.map((group) => (
            <section key={group.heading}>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">
                {group.heading}
              </h3>
              <dl className="grid gap-0.5">
                {group.items.map(([keys, what]) => (
                  <div key={keys} className="flex items-baseline justify-between gap-4">
                    <dt className="shrink-0 font-mono text-xs text-neutral-700">{keys}</dt>
                    <dd className="min-w-0 truncate text-sm text-neutral-600">{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
