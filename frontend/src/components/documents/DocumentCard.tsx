import Link from "next/link";

import type { DocumentSummary } from "@/lib/api/types";

export function DocumentCard({
  document,
  action,
}: {
  document: DocumentSummary;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="min-w-0">
        {/* The editor arrives in 2C-ii; the link is correct now and will
            resolve then. */}
        <Link
          href={`/documents/${document.id}`}
          className="block truncate font-medium text-neutral-900 hover:text-carmine-500"
        >
          {document.title}
        </Link>
        <p className="mt-0.5 text-sm text-neutral-500">
          Updated {new Date(document.updated_at).toLocaleDateString()}
        </p>
      </div>
      {action}
    </li>
  );
}
