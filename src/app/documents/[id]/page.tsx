import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentWithMeta } from "@/lib/repo";
import { DocumentEditorShell } from "@/components/DocumentEditorShell";

export default function DocumentPage({ params }: { params: { id: string } }) {
  const user = getCurrentUser();
  if (!user) redirect("/login");

  const doc = getDocumentWithMeta(params.id, user.id);
  if (!doc) notFound();

  return <DocumentEditorShell doc={doc} currentUser={user} />;
}
