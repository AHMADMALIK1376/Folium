"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { Folder } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { ManageFoldersDialog } from "./ManageFoldersDialog";

/** The query value that means "documents in no folder at all".
 *
 * A word rather than an empty string, because `?folder=` reads as a mistake
 * and an absent key already means "everything". */
export const UNFILED = "unfiled";

/** The folder rail, under the section links.
 *
 * Folders are organisation, not access — filing a document changes nothing
 * about who can read it — so this filters your own documents and never
 * appears against the ones shared with you.
 */
export function FolderNav({ folders }: { folders: Folder[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = pathname === "/dashboard" ? searchParams.get("folder") : null;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-2 px-3">
        <h2 className="text-xs font-medium tracking-wide text-neutral-400 uppercase">
          Folders
        </h2>
        <ManageFoldersDialog folders={folders} />
      </div>

      {folders.length === 0 ? (
        <p className="px-3 text-xs leading-relaxed text-neutral-400">
          Group documents you own. Sharing is unaffected.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1 sm:flex-col sm:flex-nowrap">
          {folders.map((folder) => (
            <li key={folder.id} className="min-w-0">
              <FolderLink
                href={`/dashboard?folder=${folder.id}`}
                active={active === folder.id}
                label={folder.name}
                count={folder.document_count}
              />
            </li>
          ))}
          {/* Only offered once there is somewhere to file things: with no
              folders, every document is unfiled and the link is a no-op. */}
          <li className="min-w-0">
            <FolderLink
              href={`/dashboard?folder=${UNFILED}`}
              active={active === UNFILED}
              label="Unfiled"
              muted
            />
          </li>
        </ul>
      )}
    </div>
  );
}

function FolderLink({
  href,
  active,
  label,
  count,
  muted,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      // Not prefetched, for the reason the section links are not: this rail
      // renders on the editor page too, and a prefetched dashboard would be
      // served from the Router Cache with the pre-rename title.
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-white font-medium text-carmine-700 shadow-sm"
          : "text-neutral-600 hover:bg-white hover:text-neutral-900",
        muted && !active && "text-neutral-500",
      )}
    >
      <span className="truncate">{label}</span>
      {count != null && count > 0 && (
        <span className="shrink-0 text-xs text-neutral-400">{count}</span>
      )}
    </Link>
  );
}
