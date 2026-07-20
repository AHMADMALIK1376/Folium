import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listDocumentsForUser } from "@/lib/repo";
import { DashboardActions } from "@/components/DashboardActions";
import { TopBar } from "@/components/TopBar";
import { DocumentCard } from "@/components/DocumentCard";

export default function DashboardPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");

  const { owned, shared } = listDocumentsForUser(user.id);

  return (
    <div className="page">
      <TopBar user={user} />
      <div className="container">
        <DashboardActions />

        <div className="section-header">
          <h2>My Documents ({owned.length})</h2>
        </div>
        {owned.length === 0 ? (
          <div className="empty-state">
            You don&apos;t have any documents yet. Create one above to get started.
          </div>
        ) : (
          <div className="doc-grid">
            {owned.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}

        <div className="section-header">
          <h2>Shared with Me ({shared.length})</h2>
        </div>
        {shared.length === 0 ? (
          <div className="empty-state">
            Nothing has been shared with you yet.
          </div>
        ) : (
          <div className="doc-grid">
            {shared.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
