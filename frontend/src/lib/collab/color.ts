/** Cursor colours for collaborators.
 *
 * Deliberately excludes carmine: it is the application's own accent, and a
 * cursor in it reads as part of the interface rather than as another person.
 * Each is dark enough to carry white label text.
 */
export const CURSOR_COLORS = [
  "#2563eb", // blue
  "#059669", // emerald
  "#d97706", // amber
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#c2410c", // orange
  "#4d7c0f", // lime
  "#be185d", // pink
] as const;

/** A stable colour for a user id.
 *
 * Derived from the id rather than assigned on connection, so the same person is
 * the same colour for everyone in the room and stays that colour across
 * reloads. A per-session colour makes two collaborators appear to swap
 * identities when either refreshes.
 */
export function cursorColor(userId: string): string {
  // djb2. Not cryptographic and does not need to be — it only has to be
  // deterministic and reasonably spread.
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 33) ^ userId.charCodeAt(i);
  }

  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}
