import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

/** Links and checklists, through the browser and out the other side. */

function uniqueEmail(role = "rich") {
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

async function newDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);
  await expect(page.getByRole("toolbar", { name: /formatting/i })).toBeVisible();
}

async function exportedMarkdown(page: Page): Promise<string> {
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^export$/i }).click().then(() =>
      page.getByRole("button", { name: /download as markdown/i }).click(),
    ),
  ]);

  return readFileSync(await download.path(), "utf-8");
}

test("a link survives export", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("link"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type("Read the docs");
  await page.keyboard.press("Shift+Home");

  await page.getByRole("button", { name: "Link" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/address/i).fill("example.com");
  await dialog.getByRole("button", { name: /add link/i }).click();
  await expect(dialog).toBeHidden();

  // Asserted in the document before exporting, deliberately. Without this a
  // failure downstream cannot distinguish "the link was never applied" from
  // "export dropped it" — and the first time this ran it was the former.
  // https:// is added for a bare domain, which is what people type.
  await expect(page.locator('a[href="https://example.com"]')).toHaveCount(1);

  expect(await exportedMarkdown(page)).toContain("[Read the docs](https://example.com)");
});

test("a checklist survives export", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("task"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.getByRole("button", { name: /checklist/i }).click();
  await page.keyboard.type("Buy milk");

  await expect(page.getByRole("checkbox")).toHaveCount(1);

  expect(await exportedMarkdown(page)).toContain("- [ ] Buy milk");
});

test("a checked box survives a reload", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("check"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.getByRole("button", { name: /checklist/i }).click();
  await page.keyboard.type("Call Ana");

  const box = page.getByRole("checkbox").first();
  await box.check();
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await page.reload();

  // The state, not merely the item: `checked` is an attribute on the node, and
  // an autosave that dropped it would still show the text.
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await expect(page.getByText("Call Ana")).toBeVisible();
});

test("a script URL is refused by the editor", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("xss"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type("click me");
  await page.keyboard.press("Shift+Home");

  await page.getByRole("button", { name: "Link" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/address/i).fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: /add link/i }).click();

  // Scoped to the dialog: Next.js renders its own role="alert" route announcer,
  // so an unscoped query matches two elements and fails strict mode.
  await expect(dialog.getByRole("alert")).toContainText(/cannot be used/i);
  await expect(dialog).toBeVisible();

  // And nothing was applied — the words are still plain text.
  await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);
});

test("the slash menu inserts a block by keyboard alone", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("slash"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type("/quo");

  const menu = page.getByRole("listbox", { name: /insert a block/i });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(1);

  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();

  await page.keyboard.type("A quoted line");

  // The typed "/quo" must be gone, or the command text stays in the document
  // beside the block it asked for.
  expect(await exportedMarkdown(page)).toBe("> A quoted line");
});

test("a slash mid-sentence is just a character", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("noslash"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type("see docs/readme");

  await expect(page.getByRole("listbox", { name: /insert a block/i })).toBeHidden();
});

test("a table survives export, pipes and all", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("table"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type("/table");
  await page.keyboard.press("Enter");

  // 3x3 with a header row: GFM cannot express a headerless table, so one
  // without a header would export as prose containing pipes.
  await expect(page.locator(".folium-prose table")).toHaveCount(1);
  await expect(page.locator(".folium-prose th")).toHaveCount(3);

  // The caret lands in the first header cell.
  await page.keyboard.type("Name");
  await page.keyboard.press("Tab");
  await page.keyboard.type("a|b");

  // Row and column controls appear only inside a table.
  await expect(page.getByRole("toolbar", { name: "Table" })).toBeVisible();

  const markdown = await exportedMarkdown(page);

  expect(markdown).toContain("| Name |");
  // Escaped, or it would split the author's content into two cells on the way
  // back in.
  // A raw string: "a\|b" in source is just "a|b" to JavaScript, since \| is not
  // an escape sequence — which is the opposite of what this asserts.
  expect(markdown).toContain(String.raw`a\|b`);
  expect(markdown).toContain("|---|");
});

test("the table controls are absent outside a table", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("notable"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type("Just a sentence.");

  await expect(page.getByRole("toolbar", { name: "Table" })).toBeHidden();
});

test("history shows what changed, not just what it said", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("diff"));
  await newDocument(page);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type("the quick brown fox");
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  // A second author-changing edit is not needed: the first save creates the
  // document's first version, and this edit is what the diff compares against.
  await page.keyboard.press("Control+A");
  await page.keyboard.type("the slow purple fox indeed");
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await page.getByRole("button", { name: /^history$/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /ago|just now/i }).first().click();

  await dialog.getByRole("tab", { name: /changes/i }).click();

  // Additions only, and that is the product working rather than a gap in the
  // test. Phase 3 snapshots the state BEFORE a save and writes at most one
  // version per author per five minutes, so a document created and edited
  // inside one minute has exactly one version: the empty original. Everything
  // since is an addition. Asserting a removal here would be asserting that
  // version history behaves differently than it does.
  await expect(dialog.locator("ins").first()).toBeVisible();
  await expect(dialog.getByText(/\d+ added/)).toBeVisible();

  // Marked with an element rather than colour alone, which is what makes the
  // diff readable for someone with a colour vision deficiency.
  await expect(dialog.locator("ins").first()).toContainText(/fox|slow|purple/);
});
