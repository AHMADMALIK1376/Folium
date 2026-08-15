import { cn } from "@/lib/utils";
import type { ConnectionStatus as Status } from "@/lib/collab/useCollaboration";

/** Whether this editor is sharing edits with anyone.
 *
 * Distinct from SaveStatus, and both matter. SaveStatus answers "is my work in
 * the database"; this answers "is anyone else seeing it". They fail
 * independently — autosave keeps working over plain HTTP while the room is
 * unreachable — so collapsing them into one indicator would mislead in both
 * directions.
 *
 * Phase 4-i showed nothing at all here, which meant a disconnected editor
 * looked exactly like a live one while nothing typed into it reached anybody.
 */
const LABELS: Record<Status, string> = {
  connected: "Live",
  connecting: "Connecting…",
  offline: "Offline — reconnecting",
};

export function ConnectionStatus({ status }: { status: Status }) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label="Connection status"
      className={cn(
        "flex items-center gap-1.5 text-sm",
        status === "connected" ? "text-neutral-500" : "text-carmine-700",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          status === "connected"
            ? "bg-emerald-500"
            : status === "connecting"
              ? "bg-amber-500"
              : "bg-carmine-700",
        )}
      />
      {LABELS[status]}
    </span>
  );
}
