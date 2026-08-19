import type { DocumentSummary } from "@/lib/api/types";
import { DocumentCard } from "./DocumentCard";

/** Generic over the document shape so a caller can pass a richer one — the
 *  dashboard's list items carry `starred` — without this component needing to
 *  know about it, and without widening DocumentSummary for everyone. */
export function DocumentList<T extends DocumentSummary>({
  title,
  documents,
  emptyMessage,
  renderAction,
}: {
  title: string;
  documents: T[];
  emptyMessage?: string;
  renderAction?: (document: T) => React.ReactNode;
}) {
  // A section with nothing in it and nothing to say is noise, so it is omitted
  // entirely rather than shown as an empty heading.
  if (documents.length === 0 && !emptyMessage) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-medium text-neutral-500">{title}</h2>
      {documents.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="grid gap-2">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              action={renderAction?.(document)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
