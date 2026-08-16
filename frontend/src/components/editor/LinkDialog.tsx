"use client";

import type { Editor } from "@tiptap/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALLOWED_LINK_PROTOCOLS } from "@/lib/editor/extensions";

/** Normalise what a person typed into something safe to store.
 *
 * Returns null for anything that is not allowed, rather than silently repairing
 * it — a URL quietly rewritten is worse than one refused, because the author
 * believes they linked somewhere they did not.
 *
 * Exported for its own tests: the interesting cases are the hostile ones.
 */
export function normaliseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);

  if (!scheme) {
    // "example.com" is what people type, and it is not a relative path — a
    // leading slash is. Anything else gains https rather than being refused.
    return trimmed.startsWith("/") ? trimmed : `https://${trimmed}`;
  }

  return (ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(
    scheme[1].toLowerCase(),
  )
    ? trimmed
    : null;
}

/** Add, change or remove a link on the selection. */
export function LinkDialog({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = editor.isActive("link");

  const start = () => {
    setError(null);
    setUrl(active ? (editor.getAttributes("link").href ?? "") : "");
    setOpen(true);
  };

  const apply = () => {
    const safe = normaliseUrl(url);

    if (safe === null) {
      setError(
        `That link cannot be used. Folium allows ${ALLOWED_LINK_PROTOCOLS.join(", ")}.`,
      );
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
    setOpen(false);
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Link"
        aria-pressed={active}
        title="Link"
        onMouseDown={(event) => event.preventDefault()}
        onClick={start}
        className={
          "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm transition-colors " +
          "hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-carmine-500 focus-visible:outline-none " +
          (active ? "bg-neutral-100 font-semibold text-carmine-700" : "text-neutral-600")
        }
      >
        🔗
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{active ? "Edit link" : "Add link"}</DialogTitle>
            <DialogDescription>
              Where should the selected text point?
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="link-url">Address</Label>
            <Input
              id="link-url"
              value={url}
              autoFocus
              placeholder="example.com"
              onChange={(event) => {
                setUrl(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  apply();
                }
              }}
            />
            {error && (
              <p role="alert" className="text-sm text-carmine-700">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            {active && (
              <Button variant="outline" onClick={remove}>
                Remove link
              </Button>
            )}
            <Button onClick={apply}>{active ? "Update" : "Add link"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
