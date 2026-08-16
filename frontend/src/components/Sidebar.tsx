"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** The places a document can be, in the order someone looks for one.
 *
 * Deliberately short. A sidebar earns its width by being scannable without
 * reading, and every entry added past about six makes the others harder to
 * find rather than the app more capable.
 */
const LINKS = [
  { href: "/dashboard", label: "Documents" },
  { href: "/starred", label: "Starred" },
  { href: "/trash", label: "Trash" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections" className="shrink-0 sm:w-44">
      <ul className="flex gap-1 sm:flex-col">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                // Not prefetched, and this is load-bearing rather than a
                // micro-optimisation. The sidebar renders on every page,
                // including the editor, so Next would prefetch the dashboard
                // while a document is open — before it is renamed — and then
                // serve that copy from the client Router Cache when the link is
                // clicked, showing the old title. The editor's own back link
                // carries the same `prefetch={false}` for exactly this reason,
                // and the e2e that covers renaming caught this the moment the
                // sidebar started shadowing it.
                prefetch={false}
                // aria-current, not a colour alone: which section you are in is
                // information, and a screen reader has no other way to learn it.
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-white font-medium text-carmine-700 shadow-sm"
                    : "text-neutral-600 hover:bg-white hover:text-neutral-900",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
