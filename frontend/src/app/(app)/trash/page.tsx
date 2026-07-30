import Link from "next/link";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { DocumentList } from "@/components/documents/DocumentList";
import { RestoreDocumentButton } from "@/components/documents/RestoreDocumentButton";
import { getTrash } from "@/lib/api/server";
import type { DocumentSummary } from "@/lib/api/types";

export const metadata = { title: "Trash — Folium" };

export default async function TrashPage() {
  let documents: DocumentSummary[];
  try {
    documents = await getTrash();
  } catch (error) {
    return <ApiErrorMessage error={error} />;
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Trash</h1>
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-carmine-500">
          Back to documents
        </Link>
      </div>

      <DocumentList
        title="Deleted documents"
        documents={documents}
        emptyMessage="Nothing in the trash."
        renderAction={(document) => <RestoreDocumentButton document={document} />}
      />
    </>
  );
}
