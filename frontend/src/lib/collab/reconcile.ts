import type { TipTapDoc } from "@/lib/api/types";

export type SyncAction = "seed" | "save" | "none";

/** Deep structural equality for TipTap documents.
 *
 * JSON.stringify would be shorter and wrong: it is key-order sensitive, so two
 * equivalent documents serialised by different code paths would compare as
 * different and cause a pointless write every time anyone opened the file.
 */
function sameDoc(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameDoc(item, b[index]));
  }

  if (typeof a === "object") {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every((key) => key in right && sameDoc(left[key], right[key]));
  }

  return false;
}

/** What to do when the collaboration room finishes syncing.
 *
 * Both copies are in hand at exactly this moment — the room's merged content
 * and the one the server rendered — and they can disagree in two directions:
 *
 * - **seed**: the room has never held this document. Put the stored copy in, so
 *   the first person to open it does not start from a blank page.
 * - **save**: the room is ahead. This is the "everyone closed their laptop
 *   mid-sentence" case — the merged text never reached Postgres, and the next
 *   person to open the document repairs the record.
 * - **none**: they agree, which is the ordinary case and must stay free.
 *
 * Kept pure so the decision can be tested directly. Asserting it through a
 * mocked editor would prove less and break more often.
 */
export function decideOnSync(
  roomIsEmpty: boolean,
  roomContent: TipTapDoc,
  stored: TipTapDoc,
): SyncAction {
  if (roomIsEmpty) {
    // Nothing to seed from either. A genuinely blank new document.
    return storedIsEmpty(stored) ? "none" : "seed";
  }

  return sameDoc(roomContent, stored) ? "none" : "save";
}

function storedIsEmpty(stored: TipTapDoc): boolean {
  const content = stored?.content;
  if (!Array.isArray(content) || content.length === 0) return true;

  // A single empty paragraph is what a new document holds, and is not worth
  // seeding into a room that is already empty.
  return (
    content.length === 1 &&
    sameDoc(content[0], { type: "paragraph" })
  );
}
