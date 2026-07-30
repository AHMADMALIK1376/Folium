import { cn } from "@/lib/utils";

/** Feedback banner for auth forms.
 *
 * Errors use carmine-700 — darker than the brand carmine-500 — plus an icon
 * and a tinted background. The brand colour is itself red, so colour alone
 * cannot carry the meaning; that also keeps it readable with red-green colour
 * blindness. */
export function AuthMessage({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-start gap-2 rounded-md border p-3 text-sm",
        kind === "error"
          ? "border-carmine-500/30 bg-carmine-50 text-carmine-700"
          : "border-neutral-200 bg-white text-neutral-900",
      )}
    >
      <span aria-hidden="true" className="mt-px font-semibold">
        {kind === "error" ? "!" : "✓"}
      </span>
      <span>{children}</span>
    </div>
  );
}
