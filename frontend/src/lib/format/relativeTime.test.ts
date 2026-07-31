import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { relativeTime } from "./relativeTime";

const NOW = new Date("2026-08-01T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function ago(ms: number) {
  return new Date(NOW.getTime() - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("reads as just now for the last minute", () => {
    expect(relativeTime(ago(0))).toBe("just now");
    expect(relativeTime(ago(45 * SECOND))).toBe("just now");
  });

  it("counts minutes", () => {
    expect(relativeTime(ago(MINUTE))).toBe("1 minute ago");
    expect(relativeTime(ago(5 * MINUTE))).toBe("5 minutes ago");
  });

  it("counts hours", () => {
    expect(relativeTime(ago(HOUR))).toBe("1 hour ago");
    expect(relativeTime(ago(3 * HOUR))).toBe("3 hours ago");
  });

  it("counts days", () => {
    expect(relativeTime(ago(DAY))).toBe("1 day ago");
    expect(relativeTime(ago(4 * DAY))).toBe("4 days ago");
  });

  it("falls back to a date once it is a week old", () => {
    // "37 days ago" is harder to place than the date itself.
    expect(relativeTime(ago(30 * DAY))).toMatch(/2026|Jul/);
  });

  it("does not say a version was written in the future", () => {
    // The one everyone forgets: the timestamp comes from the database and the
    // comparison happens on the user's machine, so a few seconds of clock skew
    // is normal and must not render as "in 3 seconds".
    expect(relativeTime(new Date(NOW.getTime() + 3 * SECOND).toISOString())).toBe(
      "just now",
    );
  });

  it("survives an unparseable timestamp", () => {
    expect(relativeTime("not a date")).toBe("unknown");
  });
});
