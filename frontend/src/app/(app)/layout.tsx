import Link from "next/link";

import { Logo } from "@/components/Logo";
import { Sidebar } from "@/components/Sidebar";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { StaleSessionGuard } from "@/components/auth/StaleSessionGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
