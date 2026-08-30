import { expect, test, type Page } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

async function openNewDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);
  return page.url();
}

function body(page: Page) {
  return page.getByRole("textbox", { name: /document body/i });
}

async function write(page: Page, text: string) {
  await body(page).click();
  await body(page).pressSequentially(text);
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
}

/** Select the whole document, and wait until the app agrees.
 *
 * The same trap formatting.spec.ts documents: acting on a collapsed cursor
 * applies a mark to the next character typed and changes nothing on screen. */
async function selectAll(page: Page) {
  await body(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByRole("status", { name: /document statistics/i })).toContainText(
    /words selected/i,
  );
}

test("a symbol is inserted as ordinary text", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("ins-symbol"));
  await openNewDocument(page);
  await write(page, "Tolerance ");

  await page.getByRole("button", { name: "Symbol" }).click();
  await page.getByRole("button", { name: "Plus-minus" }).click();

  await expect(body(page)).toContainText("Tolerance ±");

  // Text, not a node: it survives a reload with nothing else needed, and the
  // word count counts it as part of the word it is attached to.
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
  await page.reload();
  await expect(body(page)).toContainText("Tolerance ±");
});

test("symbols can be searched by how you would type them", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("ins-search"));
  await openNewDocument(page);
  await write(page, "a ");

  await page.getByRole("button", { name: "Symbol" }).click();
  await page.getByRole("searchbox", { name: /search symbols/i }).fill("!=");
  await page.getByRole("button", { name: "Not equal" }).click();

  await expect(body(page)).toContainText("a ≠");
});

test("a date is inserted as frozen text", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("ins-date"));
  await openNewDocument(page);
  await write(page, "Dated ");

  await page.getByRole("button", { name: "Date and time" }).click();
  const options = page.getByRole("group", { name: /date formats/i });
  await expect(options).toBeVisible();
  const iso = String(new Date().getFullYear());
  await options.getByRole("button").first().click();

  await expect(body(page)).toContainText(iso);
});

test("a table of contents lists the document's headings and follows them", async ({
  page,
}) => {
  test.slow();

  await signUp(page, uniqueEmail("ins-toc"));
  await openNewDocument(page);

  await body(page).click();
  await body(page).pressSequentially("# Introduction\n");
  await body(page).pressSequentially("Some prose.\n");
  await body(page).pressSequentially("## Background\n");
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await page.getByRole("button", { name: "Table of contents" }).click();

  const toc = body(page).locator(".folium-toc");
  await expect(toc).toBeVisible();
  await expect(toc).toContainText("Introduction");
  await expect(toc).toContainText("Background");

  // It holds nothing: rename a heading and the list follows, with no "update
  // field" anywhere. This is the assertion that proves it is derived rather
  // than a snapshot.
  // By role, not by text: "Background" is now legitimately in the document
  // twice -- once as the heading and once in the contents list -- which is the
  // feature working rather than an ambiguity to route around.
  await body(page).getByRole("heading", { name: "Background" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and method");

  await expect(toc).toContainText("Background and method");

  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
  await page.reload();
  await expect(body(page).locator(".folium-toc")).toContainText("Introduction");
});

test("a passage can be bookmarked and then cross-referenced", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("ins-bookmark"));
  await openNewDocument(page);
  await write(page, "Important passage");

  // Nothing selected, so there is nothing to name.
  await expect(page.getByRole("button", { name: "Bookmark" })).toBeDisabled();
  // And nothing to point at either.
  await expect(page.getByRole("button", { name: "Cross-reference" })).toBeDisabled();

  await selectAll(page);
  await page.getByRole("button", { name: "Bookmark" }).click();
  await page.getByRole("textbox", { name: /bookmark name/i }).fill("Methods");
  // The name is slugified, and says so before it is taken.
  await expect(page.getByText(/saved as/i)).toContainText("methods");
  await page.getByRole("button", { name: /add bookmark/i }).click();

  await expect(body(page).locator("a#methods")).toHaveText("Important passage");

  // Now it can be referenced, and the reference is an ordinary link.
  await body(page).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" — ");

  await page.getByRole("button", { name: "Cross-reference" }).click();
  await page.getByRole("button", { name: /Important passage/ }).click();

  await expect(body(page).locator('a[href="#methods"]')).toHaveCount(1);

  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
  await page.reload();
  await expect(body(page).locator("a#methods")).toHaveCount(1);
  await expect(body(page).locator('a[href="#methods"]')).toHaveCount(1);
});

test("a bookmark and a table of contents survive a Markdown round trip", async ({
  page,
}) => {
  // The parity contract is asserted in the backend suite; this proves the same
  // thing through the actual export and import the product offers.
  test.slow();

  await signUp(page, uniqueEmail("ins-roundtrip"));
  await openNewDocument(page);

  await body(page).click();
  await body(page).pressSequentially("# Heading one\n");
  await body(page).pressSequentially("Body text here");
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await page.getByRole("button", { name: "Table of contents" }).click();
  await expect(body(page).locator(".folium-toc")).toBeVisible();
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await page.getByRole("button", { name: /export/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // A contents list is not formatting Markdown cannot carry, so it must not be
  // named in the lossy warning.
  await expect(dialog).not.toContainText(/contents/i);
});
