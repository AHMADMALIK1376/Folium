"use client";

import { useEffect, useState } from "react";

/** False on the server and on the first client render; true once mounted.
 *
 * Exists to keep credentials out of URLs. A form whose only submit path is an
 * onSubmit handler has no handler attached until React hydrates — and a native
 * form submission with no method defaults to GET against the current URL, so a
 * click in that window sends every field, including the password, as a query
 * string. It then lands in browser history, the server access log, and any
 * proxy in between.
 *
 * The window is short but real: it is exactly the time between the HTML painting
 * and the JavaScript bundle executing, which on a cold cache or a slow device is
 * seconds. Gating the submit button on this closes it — the button is inert
 * before hydration, which is honest, because the form genuinely cannot work
 * before then.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}
