import Link from "next/link";

import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { CreateDocumentButton } from "@/components/documents/CreateDocumentButton";
import { DeleteDocumentDialog } from "@/components/documents/DeleteDocumentDialog";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentSearch } from "@/components/documents/DocumentSearch";
import { ImportDocumentButton } from "@/components/documents/ImportDocumentButton";
import { StarButton } from "@/components/documents/StarButton";
import { UNFILED } from "@/components/folders/FolderNav";
import { FolderSelect } from "@/components/folders/FolderSelect";
import { getDocuments, getFolders } from "@/lib/api/server";
import type { DocumentListResponse, Folder } from "@/lib/api/types";

export const metadata = { title: "Your documents — Folium" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { folder: filter } = await searchParams;

  let data: DocumentListResponse;
  let folders: Folder[];
  try {
    // One call for documents, not two. Stars used to be fetched separately,
    // and each authenticated request costs a database round trip of roughly
    // half a second against a hosted Postgres — the list carries the flag now.
    // Folders run alongside rather than after, for the same reason.
    [data, folders] = await Promise.all([getDocuments(), getFolders()]);
  } catch (error) {
    return <ApiErrorMessage error={error} />;
  }

  const filtering = filter != null && filter !== "";
  const named = folders.find((f) => f.id === filter);
  // A filter naming a folder that no longer exists — deleted in another tab,
  // or a stale bookmark. Showing "no documents" would be a lie about the
  // documents rather than the truth about the folder.
  const unknown = filtering && filter !== UNFILED && named == null;

  const owned = filtering
    ? data.owned.filter((document) =>
        filter === UNFILED ? document.folder_id == null : document.folder_id === filter,
      )
    : data.owned;

  // Falls back to "Documents" for an unknown folder as well as for no filter,
  // because there is no honest name to show for one that is gone.
  const heading = named?.name ?? (filter === UNFILED ? "Unfiled" : "Documents");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-3">
          <h1 className="truncate text-xl font-semibold text-neutral-900">{heading}</h1>
          {filtering && (
            <Link
              href="/dashboard"
              prefetch={false}
              className="text-sm text-neutral-500 underline-offset-4 hover:text-carmine-500 hover:underline"
            >
              Show all
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          <ImportDocumentButton />
          <CreateDocumentButton />
        </div>
      </div>

      {unknown ? (
        <p className="rounded-lg border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
          That folder no longer exists. Its documents were kept — they are in{" "}
          <Link
            href={`/dashboard?folder=${UNFILED}`}
            prefetch={false}
            className="text-carmine-600 underline underline-offset-4"
          >
            Unfiled
          </Link>
          .
        </p>
      ) : (
        <>
          <DocumentSearch />

          <DocumentList
            title={
              filtering
                ? owned.length === 1
                  ? "1 document"
                  : `${owned.length} documents`
                : "Your documents"
            }
            documents={owned}
            emptyMessage={
              filtering
                ? "Nothing filed here yet. Use the folder control on a document to move it."
                : "You have no documents yet."
            }
            renderAction={(document) => (
              <span className="flex items-center gap-1">
                <FolderSelect
                  documentId={document.id}
                  folderId={document.folder_id}
                  folders={folders}
                />
                <StarButton documentId={document.id} starred={document.starred} />
                <DeleteDocumentDialog document={document} />
              </span>
            )}
          />

          {/* Hidden while filtering: a folder holds documents you own, so the
              shared list is never part of the answer to "what is in this
              folder?" — and repeating it under every filter would suggest it
              were.

              No delete action on shared documents either: only an owner may
              delete, which the backend enforces, so the button would only ever
              produce a 404. No folder control, for the same reason — a shared
              document is not yours to file. The empty message is deliberate:
              an unexplained blank section gave a new user no hint that sharing
              exists at all. */}
          {!filtering && (
            <DocumentList
              title="Shared with you"
              documents={data.shared}
              emptyMessage="Documents other people share with you appear here."
              // Starrable but not deletable: a star is a private bookmark,
              // which is why a collaborator may keep one on a document they
              // cannot delete.
              renderAction={(document) => (
                <StarButton documentId={document.id} starred={document.starred} />
              )}
            />
          )}
        </>
      )}
    </>
  );
}
