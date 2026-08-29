import { expect, test } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

test("a new account sees an empty dashboard, not a blank page", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await expect(page.getByText(/no documents yet/i)).toBeVisible();
});

test("create, delete, find in trash, restore", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: /new document/i }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await page.getByRole("button", { name: /^delete$/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Deleting must not happen until confirmed. Backing out is how to prove it:
  // while the modal is open Radix marks the rest of the page aria-hidden, so a
  // role query cannot see the document either way.
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /move to trash/i }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toHaveCount(0);
  await expect(page.getByText(/no documents yet/i)).toBeVisible();

  await page.getByRole("link", { name: /^trash$/i }).click();
  await expect(page).toHaveURL(/\/trash/);
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await page.getByRole("button", { name: /restore/i }).click();
  await expect(page.getByText(/nothing in the trash/i)).toBeVisible();

  await page.getByRole("link", { name: /back to documents/i }).click();
  // This is the whole point: the server re-rendered because router.refresh()
  // invalidated it, so the restored document is present without a manual reload.
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();
});

test("the trash and dashboard both require signing in", async ({ page }) => {
  await page.goto("/trash");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/nothing in the trash/i)).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
