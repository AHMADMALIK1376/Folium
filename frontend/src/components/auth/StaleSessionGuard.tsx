"use client";

import { useEffect } from "react";

/** Reload a page restored from the back/forward cache.
 *
 * bfcache restores the entire JS heap on Back — no network request, no effects
 * re-run — so after signing out, Back would paint the previous session's
 * documents, and their contents, straight from memory. The client Router Cache
 * can serve a stale RSC payload the same way within one tab.
 *
 * `cache: "no-store"` in the server API client does not cover this: that opts
 * out of Next's Data Cache, which is a different cache from either of these.
 *
 * `persisted` is true only for a bfcache restore, so an ordinary navigation
 * pays nothing. Rendered once in the (app) layout rather than per page, so
 * every route behind the auth guard is covered by one implementation.
 */
export function StaleSessionGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
