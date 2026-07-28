import { describe, expect, it } from "vitest";
import {
  loginSchema,
  magicLinkSchema,
  newPasswordSchema,
  signupSchema,
} from "./auth";

describe("loginSchema", () => {
  it("accepts a valid pair", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "secret123" }).success,
    ).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "secret123" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("accepts a valid signup", () => {
    expect(
      signupSchema.safeParse({ email: "a@b.co", password: "secret123" }).success,
    ).toBe(true);
  });

  it("rejects a password under 8 characters", () => {
    // Supabase's own default minimum. Enforcing it client-side turns a server
    // round-trip into instant feedback.
    expect(signupSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
  });

  it("lowercases and trims the email", () => {
    const parsed = signupSchema.parse({ email: "  A@B.CO  ", password: "secret123" });
    expect(parsed.email).toBe("a@b.co");
  });
});

describe("magicLinkSchema", () => {
  it("needs only an email", () => {
    expect(magicLinkSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
  });
});

describe("newPasswordSchema", () => {
  it("requires both fields to match", () => {
    expect(
      newPasswordSchema.safeParse({ password: "secret123", confirm: "secret123" }).success,
    ).toBe(true);
    expect(
      newPasswordSchema.safeParse({ password: "secret123", confirm: "different" }).success,
    ).toBe(false);
  });

  it("reports the mismatch on the confirm field", () => {
    const result = newPasswordSchema.safeParse({ password: "secret123", confirm: "x" });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Attaching the error to `confirm` puts the message under the field the
      // user must actually change.
      expect(result.error.issues.some((i) => i.path[0] === "confirm")).toBe(true);
    }
  });
});
