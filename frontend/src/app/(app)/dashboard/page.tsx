import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { CreateDocumentButton } from "@/components/documents/CreateDocumentButton";
import { DeleteDocumentDialog } from "@/components/documents/DeleteDocumentDialog";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentSearch } from "@/components/documents/DocumentSearch";
import { ImportDocumentButton } from "@/components/documents/ImportDocumentButton";
import { StarButton } from "@/components/documents/StarButton";
import { getDocuments, getStarred } from "@/lib/api/server";
import type { DocumentListResponse, DocumentSummary } from "@/lib/api/types";

export const metadata = { title: "Your documents — Folium" };

export default async function DashboardPage() {
  let data: DocumentListResponse;
  let starred: DocumentSummary[];
  try {
    // In parallel: one waiting on the other would double the time to first
    // paint for no reason, since neither depends on the other's answer.
    [data, starred] = await Promise.all([getDocuments(), getStarred()]);
  } catch (error) {
    return <ApiErrorMessage error={error} />;
  }

  // A set, not `.some()` per row: the dashboard renders every document a person
  // owns, and a linear scan inside a render loop is quadratic for no benefit.
  const starredIds = new Set(starred.map((document) => document.id));

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Documents</h1>
        <div className="flex items-center gap-4">
          <ImportDocumentButton />
          <CreateDocumentButton />
        </div>
      </div>

      <DocumentSearch />

      <DocumentList
        title="Your documents"
        documents={data.owned}
        emptyMessage="You have no documents yet."
        renderAction={(document) => (
          <span className="flex items-center gap-1">
            <StarButton documentId={document.id} starred={starredIds.has(document.id)} />
            <DeleteDocumentDialog document={document} />
          </span>
        )}
      />

      {/* No delete action on shared documents: only an owner may delete, which
          the backend enforces, so the button would only ever produce a 404.
          The empty message is deliberate — an unexplained blank section gave a
          new user no hint that sharing exists at all. */}
      <DocumentList
        title="Shared with you"
        documents={data.shared}
        emptyMessage="Documents other people share with you appear here."
        // Starrable but not deletable: a star is a private bookmark, which is
        // why a collaborator may keep one on a document they cannot delete.
        renderAction={(document) => (
          <StarButton documentId={document.id} starred={starredIds.has(document.id)} />
        )}
      />
    </>
  );
}
