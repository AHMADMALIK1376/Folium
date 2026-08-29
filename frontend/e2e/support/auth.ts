import { expect, type Page } from "@playwright/test";

/** Signing up, in one place.
 *
 * This helper was copy-pasted byte-for-byte into sixteen spec files, and the
 * duplication was not the problem — the shared 15-second assertion was. Every
 * copy waited the suite's default for the redirect to land, and a run would
 * lose one test somewhere to a sign-up that took slightly too long. It was a
 * different test each time, which is what made it read as flakiness rather than
 * as one cause.
 */

/** How long a sign-up may take before something is genuinely wrong.
 *
 * Measured rather than picked. A Playwright trace of one of the failures shows
 * Supabase answering `POST /auth/v1/signup` with a 200 after **8.9 seconds** —
 * the sign-up worked, it was simply slower than the assertion allowed. On top
 * of that comes the redirect and the dashboard's own server render, which makes
 * several backend calls at roughly 600ms each against a database in another
 * region.
 *
 * 30s is about three times the worst case observed. Long enough that a slow
 * hosted auth service is not reported as a bug; short enough that a genuinely
 * broken sign-up still fails inside a minute.
 */
export const SIGN_UP_TIMEOUT_MS = 30_000;

export const PASSWORD = "e2e-password-123";

/** A fresh address per run.
 *
 * The backend suite learned this the hard way: fixed addresses pass once
 * against a clean database and then collide forever. `@example.com` is also
 * what backend/scripts/clean_test_data.py matches, so these accounts are
 * removable afterwards.
 *
 * `role` is only there to make a failing test say which account it was using.
 */
export function uniqueEmail(role = "user") {
  return `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Create an account and land on the dashboard.
 *
 * This project runs with email confirmation off, so Supabase returns a live
 * session and the new account is signed in immediately.
 */
export async function signUp(page: Page, email: string = uniqueEmail()): Promise<string> {
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: SIGN_UP_TIMEOUT_MS });

  return email;
}
