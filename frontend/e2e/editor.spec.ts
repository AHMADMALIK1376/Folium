import { expect, test } from "@playwright/test";

/** A fresh account per run, so the suite stays idempotent and
 *  backend/scripts/clean_test_data.py can remove what it creates. */
function uniqueEmail() {
  return `e2e-editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-password-123";

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Create a document from the dashboard and open it. */
async function openNewDocument(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
  await expect(page.getByRole("textbox", { name: /document body/i })).toBeVisible();
}

test("typing is still there after a reload", async ({ page }) => {
  // The test that matters most in this phase: it is the only one proving the
  // whole round trip — TipTap JSON out of the browser, through the token check,
  // into jsonb, and back out into a server-rendered editor.
  const sentence = `Round trip ${Date.now()}`;

  await signUp(page, uniqueEmail());
  await openNewDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type(sentence);

  await expect(page.getByRole("status")).toHaveText(/^saved$/i);

  await page.reload();
  await expect(page.getByText(sentence)).toBeVisible();
});

test("formatting survives the round trip", async ({ page }) => {
  await signUp(page, uniqueEmail());
  await openNewDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.getByRole("button", { name: /heading 1/i }).click();
  await page.keyboard.type("A heading");

  await expect(page.getByRole("status")).toHaveText(/^saved$/i);

  await page.reload();
  // Not just the text: an h1 specifically, which means the node type survived
  // as JSON rather than being flattened to a paragraph.
  await expect(
    page.getByRole("textbox", { name: /document body/i }).locator("h1"),
  ).toHaveText("A heading");
});

test("renaming in the editor shows up on the dashboard", async ({ page }) => {
  const title = `Renamed ${Date.now()}`;

  await signUp(page, uniqueEmail());
  await openNewDocument(page);

  const titleInput = page.getByRole("textbox", { name: /document title/i });
  await titleInput.fill(title);
  await expect(page.getByRole("status")).toHaveText(/^saved$/i);

  await page.getByRole("link", { name: /documents/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("a burst of typing settles on saved rather than sticking on unsaved", async ({
  page,
}) => {
  await signUp(page, uniqueEmail());
  await openNewDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  // Fast enough that the debounce coalesces most of it. What matters is where
  // the status lands, not how many requests went out.
  await page.keyboard.type("The quick brown fox jumps over the lazy dog", { delay: 15 });

  await expect(page.getByRole("status")).toHaveText(/^saved$/i);
  await page.reload();
  await expect(page.getByText(/the quick brown fox/i)).toBeVisible();
});

test("a document that does not exist says so instead of crashing", async ({ page }) => {
  await signUp(page, uniqueEmail());

  // A real UUID that belongs to nobody: the backend answers 404 for "no such
  // document" and "not yours" alike, and this must read as the ordinary case.
  await page.goto("/documents/00000000-0000-0000-0000-000000000000");

  await expect(page.getByText(/does not exist, or you do not have access/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /back to your documents/i })).toBeVisible();
});

test("the editor requires signing in", async ({ page }) => {
  await page.goto("/documents/00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("textbox", { name: /document body/i })).toHaveCount(0);
});
