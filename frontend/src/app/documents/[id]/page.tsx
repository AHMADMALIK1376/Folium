import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentWithMeta } from "@/lib/repo";
import { DocumentEditorShell } from "@/components/DocumentEditorShell";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const doc = getDocumentWithMeta(id, user.id);
  if (!doc) notFound();

  return <DocumentEditorShell doc={doc} currentUser={user} />;
}
