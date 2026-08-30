import { expect, test, type Page } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

async function openNewDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);
  return page.url();
}

function sheet(page: Page) {
  return page.locator(".folium-page");
}

/** The width of the sheet, in CSS pixels. */
async function sheetWidth(page: Page) {
  return (await sheet(page).boundingBox())!.width;
}

/** Change the page setup and wait for the save, rather than for a redraw.
 *
 * The sheet resizes from local state the instant the setting changes, so
 * asserting on its width proves nothing about persistence. Waiting on the PATCH
 * is what proves the setting reached Postgres — the same discipline the rename
 * helper in templates.spec.ts uses, and for the same reason. */
async function withSave(page: Page, action: () => Promise<unknown>) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/documents/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    ),
    action(),
  ]);
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
}

test("a document is drawn as a sheet of paper, and the margins are real", async ({
  page,
}) => {
  test.slow();

  await signUp(page, uniqueEmail("page"));
  await openNewDocument(page);

  // 96 CSS pixels to the inch, so A4 portrait is 8.27in ~= 794px. The point of
  // measuring rather than eyeballing: "it looks about right" would pass for a
  // sheet at any width at all.
  await expect(sheet(page)).toBeVisible();
  expect(await sheetWidth(page)).toBeGreaterThan(770);
  expect(await sheetWidth(page)).toBeLessThan(820);

  await page.screenshot({ path: "test-results/page-setup/a4-normal.png", fullPage: true });
});

test("the paper size and orientation change the sheet, and persist", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("page-size"));
  await openNewDocument(page);
  const portrait = await sheetWidth(page);

  await page.getByRole("button", { name: /page setup/i }).click();
  await withSave(page, () =>
    page.getByRole("combobox", { name: /orientation/i }).selectOption("landscape"),
  );

  // A4 landscape is 11.69in ~= 1122px, wider than portrait by a lot.
  const landscape = await sheetWidth(page);
  expect(landscape).toBeGreaterThan(portrait + 200);

  await page.screenshot({ path: "test-results/page-setup/a4-landscape.png" });

  // The assertion that matters: it reached the database, not just the toolbar.
  await page.reload();
  expect(await sheetWidth(page)).toBeCloseTo(landscape, -1);
});

test("a margin preset changes how much of the sheet is written on", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("page-margins"));
  await openNewDocument(page);

  const body = page.getByRole("textbox", { name: /document body/i });
  const wideMargins = (await body.boundingBox())!.width;

  await page.getByRole("button", { name: /page setup/i }).click();
  await withSave(page, () => page.getByRole("button", { name: /narrow/i }).click());

  // Narrow is 0.5in a side against Normal's 1in, so the text gets a full inch
  // more room -- 96px -- while the sheet itself does not move.
  const narrowMargins = (await body.boundingBox())!.width;
  expect(narrowMargins).toBeGreaterThan(wideMargins + 80);

  await page.screenshot({ path: "test-results/page-setup/narrow-margins.png", fullPage: true });

  await page.reload();
  await expect(page.getByRole("button", { name: /page setup/i })).toHaveText(/narrow/i);
});

test("a custom margin is taken on blur and survives a reload", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("page-custom"));
  await openNewDocument(page);

  await page.getByRole("button", { name: /page setup/i }).click();
  const field = page.getByRole("spinbutton", { name: /left margin/i });
  await field.fill("2.5");
  await withSave(page, () => field.blur());

  await expect(page.getByRole("button", { name: /page setup/i })).toHaveText(/custom/i);

  await page.reload();
  await page.getByRole("button", { name: /page setup/i }).click();
  await expect(page.getByRole("spinbutton", { name: /left margin/i })).toHaveValue("2.5");
});

test("a viewer sees the page but cannot change it", async ({ page, browser }) => {
  test.slow();

  const viewerEmail = uniqueEmail("page-viewer");
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await signUp(viewer, viewerEmail);

  await signUp(page, uniqueEmail("page-owner"));
  const url = await openNewDocument(page);

  await page.getByRole("button", { name: /page setup/i }).click();
  await withSave(page, () => page.getByRole("button", { name: /wide/i }).click());
  await page.keyboard.press("Escape");

  await viewer.goto(url);
  await page.getByRole("button", { name: /share/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /email/i }).fill(viewerEmail);
  await dialog.getByRole("combobox", { name: /permission for the new/i }).selectOption("view");
  await dialog.getByRole("button", { name: /^share$/i }).click();
  await expect(dialog.getByText(viewerEmail)).toBeVisible();

  await viewer.reload();
  // The page is part of the document, so a viewer sees it laid out the same way.
  await expect(sheet(viewer)).toBeVisible();
  // The control writes, so it is not offered to someone who may not.
  await expect(viewer.getByRole("button", { name: /page setup/i })).toHaveCount(0);

  await viewerContext.close();
});
