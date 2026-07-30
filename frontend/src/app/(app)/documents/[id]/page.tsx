import { ApiErrorMessage } from "@/components/documents/ApiErrorMessage";
import { DocumentNotFound } from "@/components/documents/DocumentNotFound";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { ApiError } from "@/lib/api/errors";
import { getDocument } from "@/lib/api/server";
import type { DocumentDetail } from "@/lib/api/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const document = await getDocument(id);
    return { title: `${document.title} — Folium` };
  } catch {
    // The page itself renders the error. A tab title is not worth a second
    // failure path, and leaking "not found" into the title tells a shoulder
    // surfer more than the page already does.
    return { title: "Folium" };
  }
}

export default async function DocumentPage({
  params,
}: {
  // Next 15: params is a promise and must be awaited.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let document: DocumentDetail;
  try {
    document = await getDocument(id);
  } catch (error) {
    // 404 gets its own message: it is the ordinary case of a deleted or
    // never-shared document, not a fault, and ApiErrorMessage's "try again"
    // would be false comfort.
    if (error instanceof ApiError && error.status === 404) return <DocumentNotFound />;
    return <ApiErrorMessage error={error} />;
  }

  return <DocumentEditor document={document} />;
}
