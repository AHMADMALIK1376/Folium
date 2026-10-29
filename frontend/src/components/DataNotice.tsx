"use client";

import { useEffect, useState } from "react";

/** The one rule about what may be stored here.
 *
 * Folium is hosted outside the country where Curavine's patients live, which is
 * fine for design documents and not for health data. Said where people sign up
 * and again inside the app, because a rule nobody is told is not a rule.
 */
export const DATA_NOTICE = "For design documents only. Do not store patient or personal health data in Folium.";

const STORAGE_KEY = "folium:data-notice-collapsed";

/** Always visible, not dismissible. For the sign-up page, where the person
 *  agrees to use the product on these terms. */
export function DataNotice() {
  return (
    <p
      role="note"
      className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      {DATA_NOTICE}
    </p>
  );
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private windows and blocked site data throw. The banner then simply
    // starts open each time, which is the safe default.
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Not remembering is acceptable; failing to render is not.
  }
}

/** The in-app reminder. Collapses to a thin line rather than disappearing, so
 *  the rule is always one click away and never gone for good. */
export function DataNoticeBanner() {
  // Read after mount. The server render is always the open banner, and a
  // remembered collapse is applied once the browser is there, so the two cannot
  // disagree during hydration.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  };

  return (
    <div
      data-print-hide
      role="note"
      className="border-b border-amber-200 bg-amber-50 text-amber-900"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-6 py-1.5 text-xs">
        {collapsed ? (
          <span className="font-medium">Design documents only</span>
        ) : (
          <span>{DATA_NOTICE}</span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="ml-auto rounded-sm underline hover:no-underline"
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
    </div>
  );
}
