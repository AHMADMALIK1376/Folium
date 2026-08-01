import { cn } from "@/lib/utils";
import type { SaveStatus as Status } from "@/lib/hooks/useAutosave";

/** The autosave indicator.
 *
 * A live region, because the only signal that work is being saved is this text
 * changing — a sighted user catches it in passing, and a screen reader user
 * needs it announced.
 *
 * "failed" says the save failed rather than going quiet. The detail of *why*
 * is rendered separately by ApiErrorMessage, which can distinguish an expired
 * session from an outage; this line only has to stop reading "Saved".
 */
const LABELS: Record<Status, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved changes",
  failed: "Not saved",
};

export function SaveStatus({ status }: { status: Status }) {
  return (
    <span
      role="status"
      aria-live="polite"
      // Named because the editor now has two live regions — this one and the
      // connection indicator. Without names they are indistinguishable to a
      // screen reader and ambiguous to a test.
      aria-label="Save status"
      className={cn(
        "text-sm tabular-nums",
        status === "failed" ? "text-carmine-700" : "text-neutral-500",
      )}
    >
      {LABELS[status]}
    </span>
  );
}
