"use client";

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
import { exportMarkdown } from "@/lib/api/documents";
import { lossyWarning } from "@/lib/editor/lossy";

/** Take a document out of Folium.
 *
 * Offered to anyone who can open the document, viewers included: exporting is
 * reading, and someone who can see every word on screen loses nothing by
 * keeping a copy.
 */
export function ExportDialog({
  documentId,
  content,
}: {
  documentId: string;
  /** The document as it stands, for warning about formatting Markdown drops. */
  content?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const warning = lossyWarning(content);

  const downloadMarkdown = async () => {
    setError(null);
    setBusy(true);
    try {
      const { blob, filename } = await exportMarkdown(documentId);

      // An object URL and a synthetic click: the only way to save a file the
      // browser fetched with an Authorization header, since a plain link
      // cannot carry one.
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = filename;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const printToPdf = () => {
    // Closed first, deliberately: the print stylesheet hides the application,
    // but an open dialog is still part of the page and would print over the
    // document.
    setOpen(false);
    // After the close has painted, or the dialog is still in the DOM when the
    // print dialog captures the page.
    window.setTimeout(() => window.print(), 100);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export this document</DialogTitle>
          <DialogDescription>
            Take a copy with you, in either format.
          </DialogDescription>
        </DialogHeader>

        {error != null && (
          <ApiErrorMessage
            error={error}
            notFoundMessage="This document is no longer available."
            fallback="Could not export the document. Try again."
          />
        )}

        {warning && (
          // Said before the button is pressed, not after the file is written.
          // A lossy export is a defensible trade; a silent one is the bug this
          // project spent Phase 6 fixing three times.
          <p
            role="note"
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {warning}
          </p>
        )}

        <div className="grid gap-2">
          <Button onClick={downloadMarkdown} disabled={busy}>
            {busy ? "Preparing…" : "Download as Markdown"}
          </Button>
          <Button variant="outline" onClick={printToPdf} disabled={busy}>
            Print or save as PDF
          </Button>
        </div>

        <p className="text-sm text-neutral-500">
          {/* Said plainly rather than discovered: the browser's dialog is where
              the filename is chosen, and it is the browser that makes the PDF. */}
          PDF opens your browser&apos;s print dialog, where you can choose
          &ldquo;Save as PDF&rdquo;.
        </p>
      </DialogContent>
    </Dialog>
  );
}
