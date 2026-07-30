"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DocumentPatch } from "@/lib/api/documents";

export type SaveStatus = "saved" | "saving" | "unsaved" | "failed";

/** How long to wait after the last change before saving.
 *
 * v1's interval. Long enough that a sentence is one request, short enough that
 * a crash costs a phrase rather than a paragraph. */
export const AUTOSAVE_DELAY_MS = 800;

/** Debounced autosave with an explicit flush for when the page goes away.
 *
 * The pending patch lives in a ref, not state, for two reasons: a keystroke
 * must not be captured in a stale closure, and `flush` has to read the newest
 * value at the moment it is called — which is inside an unload handler, after
 * the last render.
 *
 * The save function is injected rather than imported so the tests need neither
 * a network nor a Supabase session.
 */
export function useAutosave({
  save,
}: {
  save: (patch: DocumentPatch, init?: RequestInit) => Promise<unknown>;
}) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<unknown>(null);

  const pending = useRef<DocumentPatch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so `run` and `flush` stay referentially stable: they are
  // dependencies of the unload effect, and re-subscribing on every keystroke
  // would be wasteful and easy to get wrong.
  const saveRef = useRef(save);
  saveRef.current = save;

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const run = useCallback(
    async (init?: RequestInit) => {
      const patch = pending.current;
      if (patch === null) return;

      // Taken before awaiting: an edit arriving mid-save schedules its own save
      // rather than being silently folded into this one and lost if it fails.
      pending.current = null;
      clearTimer();
      setStatus("saving");

      try {
        await saveRef.current(patch, init);
        setStatus("saved");
        setError(null);
      } catch (e) {
        // Deliberately not retried on a timer. The next edit tries again, and
        // until then the status says plainly that the save failed.
        setError(e);
        setStatus("failed");
      }
    },
    [clearTimer],
  );

  /** Record a change and start (or restart) the debounce. */
  const schedule = useCallback(
    (patch: DocumentPatch) => {
      pending.current = { ...pending.current, ...patch };
      setStatus("unsaved");
      clearTimer();
      timer.current = setTimeout(() => void run(), AUTOSAVE_DELAY_MS);
    },
    [clearTimer, run],
  );

  /** Save a pending change now, for when the page is being torn down.
   *
   * `keepalive` lets the request outlive the document. sendBeacon would not
   * work: it cannot set the Authorization header this API requires. */
  const flush = useCallback(() => {
    if (pending.current === null) return;
    void run({ keepalive: true });
  }, [run]);

  // Flush on unmount rather than merely cancelling the timer.
  //
  // beforeunload and visibilitychange cover the page going away, but not the
  // commonest exit of all: clicking a link inside the app. That is a client-side
  // navigation — no unload event, no visibility change — so a cancelled timer
  // silently discarded whatever the user typed in the last 800ms. Leaving the
  // editor via "← Documents" immediately after renaming lost the rename.
  //
  // Fire-and-forget by necessity: the component is going away, so there is
  // nobody left to show an error to. keepalive means the request completes even
  // if a full navigation follows.
  useEffect(() => {
    return () => {
      if (pending.current !== null) {
        void saveRef.current(pending.current, { keepalive: true });
      }
      clearTimer();
    };
  }, [clearTimer]);

  return { status, error, schedule, flush };
}
