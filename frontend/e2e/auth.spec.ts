import { expect, test } from "@playwright/test";

/** A fresh address per run.
 *
 * The backend suite learned this the hard way: fixed addresses pass once
 * against a clean database and then collide forever. `@example.com` is also
 * what backend/scripts/clean_test_data.py matches, so these accounts are
 * removable afterwards. */
function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-password-123";

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
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText(email)).toBeVisible();

  // Sign out, then prove the credentials work for a real sign-in too.
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await expect(page).toHaveURL(/\/account/);
  // This is the milestone: the address came back from FastAPI, which verified
  // the Supabase token and provisioned the user row before answering.
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText(/account id/i)).toBeVisible();

  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("a guarded page returns you where you were headed", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/redirectTo=%2Faccount/);
});
