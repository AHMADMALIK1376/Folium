import Link from "next/link";

import type { DocumentSummary } from "@/lib/api/types";

export function DocumentCard({
  document,
  action,
}: {
  document: DocumentSummary;
  action?: React.ReactNode;
}) {
  // Stacked below sm, in a row above it. A dashboard card carries a title, a
  // folder control, a star and a delete button; side by side on a 375px screen
  // they ran 26px past the edge and made the whole page pan sideways. Measured
  // rather than guessed — e2e/mobile.spec.ts asserts it.
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </li>
  );
}
