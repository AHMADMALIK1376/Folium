import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/Logo";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { StaleSessionGuard } from "@/components/auth/StaleSessionGuard";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { getFolders } from "@/lib/api/server";
import type { Folder } from "@/lib/api/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Fetched here rather than per page because the rail is part of the shell.
  // It costs no wall-clock time: Next renders the layout and the page
  // concurrently, so this runs alongside the page's own fetch rather than
  // before it.
  //
  // Never allowed to throw. A page can render an ApiErrorMessage when its
  // fetch fails; the shell has nowhere to put one, and a folder list that
  // could take down every page including the editor is not worth having.
  let folders: Folder[] = [];
  try {
    folders = await getFolders();
  } catch {
    folders = [];
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* One guard for every page behind the auth boundary: a bfcache restore
          must not paint the previous session's documents. */}
      <StaleSessionGuard />
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="rounded-sm hover:opacity-80">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-4">
            {/* Before the account link, because it is the thing that changes. */}
            <NotificationBell />
            <Link href="/account" className="text-sm text-neutral-500 hover:text-carmine-500">
              Account
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>
      {/* The same max width and padding as the header, which is the whole
          point: they were 4xl and 5xl respectively, so the logo sat visibly
          right of the sidebar edge. Wide, because a document app on a 1900px
          screen spent a third of it on empty margins — the editor keeps its own
          reading width via .folium-prose rather than the shell enforcing one. */}
      <div className="mx-auto flex max-w-[1600px] flex-col gap-8 px-6 py-8 sm:flex-row">
        {/* The sidebar reads the folder filter out of the query string,
            which makes it a Suspense boundary's problem rather than the whole
            route's. */}
        <Suspense fallback={<div className="shrink-0 sm:w-44" />}>
          <Sidebar folders={folders} />
        </Suspense>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
