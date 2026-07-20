import Link from "next/link";
import type { DocumentWithMeta } from "@/lib/types";

function formatDate(iso: string) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function DocumentCard({ doc }: { doc: DocumentWithMeta }) {
  return (
    <Link href={`/documents/${doc.id}`} className="doc-card">
      <div className="doc-card-title">{doc.title}</div>
      <div className="doc-card-meta">
        {doc.is_owner ? `Edited ${formatDate(doc.updated_at)}` : `Owned by ${doc.owner_name}`}
      </div>
      <span className={`badge ${doc.is_owner ? "badge-owned" : "badge-shared"}`}>
        {doc.is_owner ? "Owned by you" : "Shared with you"}
      </span>
    </Link>
  );
}
