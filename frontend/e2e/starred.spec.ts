import { expect, test, type Page } from "@playwright/test";

/** Starring, and the sidebar that surfaces it. */

function uniqueEmail(role = "star") {
  return `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-password-123";

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("a starred document appears under Starred, and unstarring removes it", async ({
  page,
}) => {
  test.slow();

  await signUp(page, uniqueEmail());
  await page.getByRole("button", { name: /new document/i }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await page.getByRole("button", { name: /star this document/i }).click();
  await expect(page.getByRole("button", { name: /remove star/i })).toBeVisible();

  const sidebar = page.getByRole("navigation", { name: /sections/i });
  await sidebar.getByRole("link", { name: "Starred" }).click();
  await expect(page).toHaveURL(/\/starred/);
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await page.getByRole("button", { name: /remove star/i }).click();
  await expect(page.getByText(/star a document and it appears here/i)).toBeVisible();
});

test("the sidebar says which section you are in", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("nav"));

  const sidebar = page.getByRole("navigation", { name: /sections/i });
  await expect(sidebar.getByRole("link", { name: "Documents" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await sidebar.getByRole("link", { name: "Trash" }).click();
  await expect(page).toHaveURL(/\/trash/);
  await expect(sidebar.getByRole("link", { name: "Trash" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
