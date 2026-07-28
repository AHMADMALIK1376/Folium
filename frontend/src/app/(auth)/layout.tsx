export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
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
