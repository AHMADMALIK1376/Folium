import { expect, test } from "@playwright/test";

import { PASSWORD, SIGN_UP_TIMEOUT_MS, signUp, uniqueEmail } from "./support/auth";

test("signed-out visitors cannot reach the account page", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
  // The guard must run before any protected markup renders.
  await expect(page.getByText(/account id/i)).toHaveCount(0);
});

test("the login form never reveals whether an account exists", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("definitely-not-registered@example.com");
  await page.getByLabel(/password/i).fill("whatever123");
  await page.getByRole("button", { name: /^sign in$/i }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText(/no account|not found/i);
});

test("sign up, sign in, see the profile from the API, sign out", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();

  // This project runs with email confirmation off, so Supabase returns a live
  // session and the new account is signed in immediately. Telling them to
  // check an inbox no mail was sent to would strand them on /signup.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: SIGN_UP_TIMEOUT_MS });

  // The profile now lives one click away rather than being the landing page,
  // so this also proves the header keeps it reachable.
  await page.getByRole("link", { name: /^account$/i }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText(email)).toBeVisible();

  // Sign out, then prove the credentials work for a real sign-in too.
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: SIGN_UP_TIMEOUT_MS });

  await page.goto("/account");
  // This is the milestone: the address came back from FastAPI, which verified
  // the Supabase token and provisioned the user row before answering.
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(/account id/i)).toBeVisible();

  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("credentials never reach a URL", async ({ page }) => {
  // A form whose only submit path is an onSubmit handler has no handler until
  // React hydrates, and a native submit with no method is a GET — so a click in
  // that window puts the password in the query string, then in browser history
  // and every access log along the way. The submit button is disabled until
  // hydration to close that window; this asserts the outcome rather than the
  // mechanism.
  const seen: string[] = [];
  page.on("framenavigated", (frame) => seen.push(frame.url()));

  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(uniqueEmail());
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: SIGN_UP_TIMEOUT_MS });

  for (const url of [...seen, page.url()]) {
    expect(url).not.toContain("password");
    expect(url).not.toContain(PASSWORD);
  }
});

test("a guarded page returns you where you were headed", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/redirectTo=%2Fdashboard/);
});
