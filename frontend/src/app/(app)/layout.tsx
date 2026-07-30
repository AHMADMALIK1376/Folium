import Link from "next/link";

import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { StaleSessionGuard } from "@/components/auth/StaleSessionGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* One guard for every page behind the auth boundary: a bfcache restore
          must not paint the previous session's documents. */}
      <StaleSessionGuard />
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
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
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
