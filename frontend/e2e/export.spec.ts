import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

function uniqueEmail(role = "export") {
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

test("a document downloads as Markdown, with its formatting", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail());

  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);

  const body = page.getByRole("textbox", { name: /document body/i });
  await body.click();
  await page.getByRole("button", { name: /heading 1/i }).click();
  await page.keyboard.type("Quarterly notes");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /paragraph/i }).click();
  await page.keyboard.type("A plain sentence.");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /bulleted list/i }).click();
  await page.keyboard.type("First item");

  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^export$/i }).click().then(() =>
      page.getByRole("button", { name: /download as markdown/i }).click(),
    ),
  ]);

  // The file's contents, not merely that a download happened — the conversion
  // is the part worth proving.
  const path = await download.path();
  const markdown = readFileSync(path, "utf-8");

  expect(markdown).toContain("# Quarterly notes");
  expect(markdown).toContain("A plain sentence.");
  expect(markdown).toContain("- First item");

  // And the name comes from the document, not from the browser's default.
  expect(download.suggestedFilename()).toMatch(/\.md$/);
});

test("a viewer can export a document shared with them", async ({ browser }) => {
  test.slow();

  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();

  const guestEmail = uniqueEmail("viewer");
  await signUp(owner, uniqueEmail("owner"));
  await signUp(guest, guestEmail);

  await owner.getByRole("button", { name: /new document/i }).click();
  await owner.getByRole("link", { name: /untitled document/i }).click();
  await owner.getByRole("textbox", { name: /document body/i }).click();
  await owner.keyboard.type("Shared for reading");
  await expect(owner.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await owner.getByRole("button", { name: /^share$/i }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /email/i }).fill(guestEmail);
  await dialog
    .getByRole("combobox", { name: /permission for the new/i })
    .selectOption("view");
  await dialog.getByRole("button", { name: /^share$/i }).click();
  await expect(dialog.getByText(guestEmail)).toBeVisible();

  await guest.goto("/dashboard");
  await guest.getByRole("link", { name: /untitled document/i }).click();
  await expect(guest.getByText(/read-only/i)).toBeVisible();

  // Exporting is reading: someone who can see every word loses nothing by
  // keeping a copy, so the control is offered to viewers too.
  const [download] = await Promise.all([
    guest.waitForEvent("download"),
    guest.getByRole("button", { name: /^export$/i }).click().then(() =>
      guest.getByRole("button", { name: /download as markdown/i }).click(),
    ),
  ]);

  expect(readFileSync(await download.path(), "utf-8")).toContain("Shared for reading");

  await ownerContext.close();
  await guestContext.close();
});

test("a quote, a code block and struck text all survive export", async ({ page }) => {
  // The assertion that would have caught Phase 6-i's bug. The test above only
  // ever checked "# " and "- ", so a blockquote exporting as an empty string
  // passed it every time.
  test.slow();

  await signUp(page, uniqueEmail("rich"));

  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);

  await page.getByRole("textbox", { name: /document body/i }).click();

  await page.getByRole("button", { name: /^quote$/i }).click();
  await page.keyboard.type("A quoted line");
  // Enter twice to leave the quote, NOT a second click on the button: clicking
  // it again toggles the blockquote off the line just typed, which is exactly
  // what this test caught the first time it ran. The second Enter lifts an
  // empty paragraph out of the quote, which is ProseMirror's own behaviour.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /strikethrough/i }).click();
  await page.keyboard.type("struck through");
  await page.getByRole("button", { name: /strikethrough/i }).click();

  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /code block/i }).click();
  await page.keyboard.type("weight = a ** b");

  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^export$/i }).click().then(() =>
      page.getByRole("button", { name: /download as markdown/i }).click(),
    ),
  ]);

  const markdown = readFileSync(await download.path(), "utf-8");

  expect(markdown).toContain("> A quoted line");
  expect(markdown).toContain("~~struck through~~");
  expect(markdown).toContain("```");
  // Unescaped inside the fence: a backslash there would change the code.
  expect(markdown).toContain("weight = a ** b");
});
