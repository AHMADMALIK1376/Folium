import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT, safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it("passes through a normal same-origin path", () => {
    expect(safeRedirect("/account")).toBe("/account");
    expect(safeRedirect("/documents/abc")).toBe("/documents/abc");
  });

  it("defaults to the dashboard", () => {
    // Pinned deliberately: where a signed-in user lands is a product decision,
    // not an arbitrary default, so changing it should break a test.
    expect(DEFAULT_REDIRECT).toBe("/dashboard");
    expect(safeRedirect(null)).toBe("/dashboard");
  });

  it("falls back to the default for missing input", () => {
    expect(safeRedirect(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirect(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirect("")).toBe(DEFAULT_REDIRECT);
  });

  it("rejects off-origin and protocol-relative targets", () => {
    expect(safeRedirect("https://evil.example.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirect("//evil.example.com")).toBe(DEFAULT_REDIRECT);
    // A single literal backslash after the leading slash: browsers normalise
    // this to a protocol-relative "//evil.example.com" navigation.
    expect(safeRedirect("/\\evil.example.com")).toBe(DEFAULT_REDIRECT);
    // Two literal backslashes: same normalisation risk.
    expect(safeRedirect("/\\\\evil.example.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirect("http://evil.example.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirect("javascript:alert(1)")).toBe(DEFAULT_REDIRECT);
  });
});
