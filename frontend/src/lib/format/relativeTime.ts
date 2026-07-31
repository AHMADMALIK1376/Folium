const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

/** "5 minutes ago" from an ISO timestamp.
 *
 * Hand-written rather than pulled in: a date library is a dependency, a bundle,
 * and a locale story for one line of UI in one panel.
 *
 * Beyond a week it gives the date instead. "37 days ago" is harder to place
 * than "1 July".
 */
export function relativeTime(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "unknown";

  const elapsed = Date.now() - then.getTime();

  // Clamped at zero. The timestamp comes from the database and the comparison
  // happens on the user's machine, so a few seconds of clock skew is ordinary —
  // and "in 3 seconds" would read as a bug in the history itself.
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour");
  if (elapsed < WEEK) return plural(Math.floor(elapsed / DAY), "day");

  return then.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
