import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm">
        {/* One place for the mark across sign-in, sign-up, and reset — all
            three render inside this layout. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" withWordmark={false} />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900">
            Folium
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Write and share documents
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
