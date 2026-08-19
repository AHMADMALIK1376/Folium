import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { CreateDocumentButton } from "@/components/documents/CreateDocumentButton";
import { DeleteDocumentDialog } from "@/components/documents/DeleteDocumentDialog";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentSearch } from "@/components/documents/DocumentSearch";
import { ImportDocumentButton } from "@/components/documents/ImportDocumentButton";
import { StarButton } from "@/components/documents/StarButton";
import { getDocuments } from "@/lib/api/server";
import type { DocumentListResponse } from "@/lib/api/types";

export const metadata = { title: "Your documents — Folium" };

export default async function DashboardPage() {
  let data: DocumentListResponse;
  try {
    // One call, not two. Stars used to be fetched separately, and each
    // authenticated request costs a database round trip of roughly half a
    // second against a hosted Postgres — the list carries the flag now.
    data = await getDocuments();
  } catch (error) {
    return <ApiErrorMessage error={error} />;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
            <StarButton documentId={document.id} starred={document.starred} />
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
          <StarButton documentId={document.id} starred={document.starred} />
        )}
      />
    </>
  );
}
