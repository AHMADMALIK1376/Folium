"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { updateDocument } from "@/lib/api/documents";
import { cn } from "@/lib/utils";

/** Mark this document as a template, or stop.
 *
 * Owner only — an editor may change what a document says, but whether it is
 * offered to everyone as a starting point is the owner's call, and the backend
 * enforces that with a 404.
 *
 * Nothing else about the document changes. It stays in the list, exports the
 * same way, and can still be edited: the flag only says "offer this when
 * starting something new".
 */
export function TemplateToggle({
  documentId,
  isTemplate: initial,
}: {
  documentId: string;
  isTemplate: boolean;
}) {
  const router = useRouter();
  const [isTemplate, setIsTemplate] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !isTemplate;
    setIsTemplate(next);
    setBusy(true);

    try {
      await updateDocument(documentId, { is_template: next });
      // So the dashboard's picker reflects it without a manual reload.
      router.refresh();
    } catch {
      // Optimistic, and reverted on failure — the same trade the star makes,
      // for the same reason: waiting a round trip to see whether a toggle took
      // is more disruptive than the rare failure it would report.
      setIsTemplate(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={busy}
      aria-pressed={isTemplate}
      title={
        isTemplate
          ? "This document is offered as a template"
          : "Offer this document as a template"
      }
      className={cn(isTemplate && "bg-carmine-50 text-carmine-700")}
    >
      {isTemplate ? "Template" : "Save as template"}
    </Button>
  );
}
