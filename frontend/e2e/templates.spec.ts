import { expect, test, type Page } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

async function openNewDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);
  return page.url();
}

async function write(page: Page, text: string) {
  const body = page.getByRole("textbox", { name: /document body/i });
  await body.click();
  await body.pressSequentially(text);
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
}

/** Rename, waiting on the PATCH rather than the status text.
 *
 * The status starts at "Saved", so asserting on it can match the state before
 * the edit was registered — the same trap editor.spec.ts documents, and the one
 * the lost-rename-on-navigate bug hid behind. */
async function rename(page: Page, title: string) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/documents/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    ),
    page.getByRole("textbox", { name: /document title/i }).fill(title),
  ]);
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
}

test("a document can be duplicated, and the copy is its own document", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("dup"));
  await openNewDocument(page);
  await rename(page, "Quarterly plan");
  await write(page, "The original body.");

  await page.getByRole("link", { name: /documents/i }).first().click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: "Duplicate Quarterly plan" }).click();

  await expect(page.getByRole("link", { name: "Copy of Quarterly plan" })).toBeVisible();
  // The original is still there — a duplicate is not a move. `exact`, because
  // "Quarterly plan" is a substring of "Copy of Quarterly plan".
  await expect(
    page.getByRole("link", { name: "Quarterly plan", exact: true }),
  ).toBeVisible();

  // And the copy carries the content.
  await page.getByRole("link", { name: "Copy of Quarterly plan" }).click();
  await expect(page.getByRole("textbox", { name: /document body/i })).toContainText(
    "The original body.",
  );
});

test("editing a copy does not touch the original", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("dup-indep"));
  await openNewDocument(page);
  await rename(page, "Source");
  await write(page, "Unchanged text.");

  await page.getByRole("link", { name: /documents/i }).first().click();
  await page.getByRole("button", { name: "Duplicate Source" }).click();
  await expect(page.getByRole("link", { name: "Copy of Source" })).toBeVisible();

  await page.getByRole("link", { name: "Copy of Source" }).click();
  await write(page, " Added only to the copy.");

  await page.getByRole("link", { name: /documents/i }).first().click();
  await page.getByRole("link", { name: "Source", exact: true }).click();
  const body = page.getByRole("textbox", { name: /document body/i });
  await expect(body).toContainText("Unchanged text.");
  await expect(body).not.toContainText("Added only to the copy.");
});

test("a built-in template starts a document with its structure", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("tmpl-builtin"));

  await page.getByRole("button", { name: /new from template/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Meeting notes")).toBeVisible();
  await dialog.getByText("Meeting notes").click();

  // Straight into the document, because someone who picked a template wants to
  // start writing.
  await expect(page).toHaveURL(/\/documents\//);
  const body = page.getByRole("textbox", { name: /document body/i });
  await expect(body).toContainText("Attendees");
  await expect(body).toContainText("Decisions");
  await expect(body).toContainText("Actions");
});

test("your own document can become a template, and start a new document", async ({
  page,
}) => {
  test.slow();

  await signUp(page, uniqueEmail("tmpl-own"));
  await openNewDocument(page);
  await rename(page, "House style");
  await write(page, "The shape we always use.");

  await page.getByRole("button", { name: /save as template/i }).click();
  await expect(page.getByRole("button", { name: /^template$/i })).toBeVisible();

  await page.getByRole("link", { name: /documents/i }).first().click();
  await page.getByRole("button", { name: /new from template/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/^yours$/i)).toBeVisible();
  await dialog.getByRole("button", { name: "House style" }).click();

  await expect(page).toHaveURL(/\/documents\//);
  // Under the template's own name, not "Copy of" — that is the difference
  // between using a template and duplicating a document.
  await expect(page.getByRole("textbox", { name: /document title/i })).toHaveValue(
    "House style",
  );
  await expect(page.getByRole("textbox", { name: /document body/i })).toContainText(
    "The shape we always use.",
  );
  // And the new document is not itself a template, which is the point of one.
  await expect(page.getByRole("button", { name: /save as template/i })).toBeVisible();
});

test("a shared document can be duplicated by the person it was shared with", async ({
  page,
  browser,
}) => {
  // They can already export it as Markdown and import the file back. The button
  // grants nothing new; it removes the detour.
  test.slow();

  const friendEmail = uniqueEmail("dup-friend");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await signUp(friend, friendEmail);

  await signUp(page, uniqueEmail("dup-owner"));
  await openNewDocument(page);
  await rename(page, "Shared thing");
  await write(page, "Worth copying.");

  await page.getByRole("button", { name: /share/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /email/i }).fill(friendEmail);
  await dialog.getByRole("combobox", { name: /permission for the new/i }).selectOption("view");
  await dialog.getByRole("button", { name: /^share$/i }).click();
  await expect(dialog.getByText(friendEmail)).toBeVisible();

  await friend.goto("/dashboard");
  await expect(friend.getByRole("link", { name: "Shared thing" })).toBeVisible();
  await friend.getByRole("button", { name: "Duplicate Shared thing" }).click();

  // The copy is theirs, under their own documents.
  await expect(friend.getByRole("link", { name: "Copy of Shared thing" })).toBeVisible();

  await friendContext.close();
});
