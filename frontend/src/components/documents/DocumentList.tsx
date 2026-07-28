import type { DocumentSummary } from "@/lib/api/types";
import { DocumentCard } from "./DocumentCard";

export function DocumentList({
  title,
  documents,
  emptyMessage,
  renderAction,
}: {
  title: string;
  documents: DocumentSummary[];
  emptyMessage?: string;
  renderAction?: (document: DocumentSummary) => React.ReactNode;
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
