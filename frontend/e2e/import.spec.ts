import { expect, test, type Page } from "@playwright/test";

function uniqueEmail() {
  return `e2e-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-password-123";

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

const MARKDOWN = `# Quarterly notes

Some **bold** text and some *italic* text.

- First item
- Second item
`;

test("a .md file becomes a document with its structure intact", async ({ page }) => {
  await signUp(page, uniqueEmail());

  // setInputFiles takes the buffer directly, so nothing is written to disk —
  // and nothing lands on C:.
  await page.getByLabel(/import a \.txt or \.md file/i).setInputFiles({
    name: "quarterly.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(MARKDOWN, "utf-8"),
  });

  // Importing opens the document, unlike creating a blank one.
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);

  const body = page.getByRole("textbox", { name: /document body/i });
  // Nodes, not just text: an h1 and a list item prove the backend's converter
  // produced real TipTap structure rather than a wall of paragraphs.
  await expect(body.locator("h1")).toHaveText("Quarterly notes");
  await expect(body.locator("li").first()).toContainText("First item");
  await expect(body.locator("strong").first()).toHaveText("bold");

  // The title comes from the filename, without its extension.
  await expect(page.getByRole("textbox", { name: /document title/i })).toHaveValue(
    /quarterly/i,
  );

  // And it survives a reload, which means it is in the database.
  await page.reload();
  await expect(body.locator("h1")).toHaveText("Quarterly notes");
});

test("a .txt file imports as paragraphs", async ({ page }) => {
  await signUp(page, uniqueEmail());

  await page.getByLabel(/import a \.txt or \.md file/i).setInputFiles({
    name: "plain.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("First paragraph.\n\nSecond paragraph.\n", "utf-8"),
  });

  await expect(page).toHaveURL(/\/documents\//);
  const body = page.getByRole("textbox", { name: /document body/i });
  await expect(body.locator("p").first()).toContainText("First paragraph.");
  // A .txt file has no headings to find, so nothing should have invented any.
  await expect(body.locator("h1")).toHaveCount(0);
});

test("an unsupported file type is refused without uploading", async ({ page }) => {
  await signUp(page, uniqueEmail());

  let importAttempted = false;
  page.on("request", (request) => {
    if (request.url().includes("/documents/import")) importAttempted = true;
  });

  await page.getByLabel(/import a \.txt or \.md file/i).setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 not really a pdf", "utf-8"),
  });

  await expect(page.getByRole("alert").filter({ hasText: /only \.txt and \.md/i })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(importAttempted).toBe(false);
});
