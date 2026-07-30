import Link from "next/link";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { CreateDocumentButton } from "@/components/documents/CreateDocumentButton";
import { DeleteDocumentDialog } from "@/components/documents/DeleteDocumentDialog";
import { DocumentList } from "@/components/documents/DocumentList";
import { getDocuments } from "@/lib/api/server";
import type { DocumentListResponse } from "@/lib/api/types";

export const metadata = { title: "Your documents — Folium" };

export default async function DashboardPage() {
  let data: DocumentListResponse;
  try {
    data = await getDocuments();
  } catch (error) {
    return <ApiErrorMessage error={error} />;
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Documents</h1>
        <div className="flex items-center gap-4">
          <Link href="/trash" className="text-sm text-neutral-500 hover:text-carmine-500">
            Trash
          </Link>
          <CreateDocumentButton />
        </div>
      </div>

      <DocumentList
        title="Your documents"
        documents={data.owned}
        emptyMessage="You have no documents yet."
        renderAction={(document) => <DeleteDocumentDialog document={document} />}
      />

      {/* No delete action on shared documents: only an owner may delete, which
          the backend enforces, so the button would only ever produce a 404. */}
      <DocumentList title="Shared with you" documents={data.shared} />
    </>
  );
}
