"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { duplicateDocument } from "@/lib/api/documents";
import type { DocumentDetail, DocumentListItem } from "@/lib/api/types";
import { BUILT_IN_TEMPLATES } from "@/lib/editor/templates";

/** Start a document from something that already exists.
 *
 * Two sources in one list, because to the person starting a document the
 * difference does not matter: the built-in templates are content defined in the
 * app, and their own are real documents with a flag on them.
 */
export function TemplatePicker({ templates }: { templates: DocumentListItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const go = async (key: string, create: () => Promise<DocumentDetail>) => {
    setError(null);
    setBusy(key);
    try {
      const created = await create();
      setOpen(false);
      // Straight into the new document rather than back to a list it is now
      // sitting in: someone who picked a template wants to start writing.
      router.push(`/documents/${created.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">New from template</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            Mark any document of your own as a template from its editor, and it
            appears here.
          </DialogDescription>
        </DialogHeader>

        {error != null && (
          <ApiErrorMessage error={error} fallback="Could not create the document." />
        )}

        <div className="grid max-h-[55vh] gap-3 overflow-y-auto">
          {templates.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">
                Yours
              </h3>
              <ul className="grid gap-1">
                {templates.map((template) => (
                  <li key={template.id}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        // as_copy=false: a template becomes a document under
                        // its own name, not "Copy of".
                        go(template.id, () => duplicateDocument(template.id, false))
                      }
                      className="block w-full truncate rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm hover:border-carmine-500 disabled:opacity-50"
                    >
                      {busy === template.id ? "Creating…" : template.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-neutral-400 uppercase">
              Built in
            </h3>
            <ul className="grid gap-1">
              {BUILT_IN_TEMPLATES.map((template) => (
                <li key={template.key}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      go(template.key, () =>
                        apiFetch<DocumentDetail>("/api/v1/documents", {
                          method: "POST",
                          body: JSON.stringify({
                            title: template.title,
                            content: template.content,
                          }),
                        }),
                      )
                    }
                    className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-left hover:border-carmine-500 disabled:opacity-50"
                  >
                    <span className="block truncate text-sm text-neutral-900">
                      {busy === template.key ? "Creating…" : template.title}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {template.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
