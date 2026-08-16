import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { DocumentList } from "@/components/documents/DocumentList";
import { StarButton } from "@/components/documents/StarButton";
import { getStarred } from "@/lib/api/server";
import type { DocumentSummary } from "@/lib/api/types";

export const metadata = { title: "Starred — Folium" };

export default async function StarredPage() {
  let documents: DocumentSummary[];
  try {
    documents = await getStarred();
  } catch (error) {
    return <ApiErrorMessage error={error} fallback="Could not load your starred documents." />;
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold text-neutral-900">Starred</h1>

      <DocumentList
        title="Starred documents"
        documents={documents}
        emptyMessage="Star a document and it appears here."
        // Everything on this page is starred by definition, so the control is
        // only ever an unstar — and clicking it removes the row.
        renderAction={(document) => <StarButton documentId={document.id} starred />}
      />
    </>
  );
}
