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

test("find highlights every match, and steps through them", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("find"));
  await openNewDocument(page);
  await write(page, "The cat sat on the mat. The cat was fat.");

  await page.keyboard.press("Control+f");
  const bar = page.getByRole("search", { name: /find in document/i });
  await expect(bar).toBeVisible();

  await bar.getByRole("textbox", { name: "Find" }).fill("cat");
  await expect(bar.getByText("1 of 2")).toBeVisible();
  // Decorations, so the document itself is untouched.
  await expect(page.locator(".folium-find")).toHaveCount(2);
  await expect(page.locator(".folium-find-current")).toHaveCount(1);

  await bar.getByRole("button", { name: /next match/i }).click();
  await expect(bar.getByText("2 of 2")).toBeVisible();

  // Wraps rather than stopping at the end.
  await bar.getByRole("button", { name: /next match/i }).click();
  await expect(bar.getByText("1 of 2")).toBeVisible();
});

test("find says so when there is nothing to find", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("find-none"));
  await openNewDocument(page);
  await write(page, "Nothing of the sort in here.");

  await page.keyboard.press("Control+f");
  const bar = page.getByRole("search", { name: /find in document/i });
  await bar.getByRole("textbox", { name: "Find" }).fill("elephant");

  await expect(bar.getByText("0 results")).toBeVisible();
  await expect(page.locator(".folium-find")).toHaveCount(0);
});

test("match case narrows the search", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("find-case"));
  await openNewDocument(page);
  await write(page, "The the THE");

  await page.keyboard.press("Control+f");
  const bar = page.getByRole("search", { name: /find in document/i });
  await bar.getByRole("textbox", { name: "Find" }).fill("the");
  await expect(bar.getByText("1 of 3")).toBeVisible();

  await bar.getByRole("button", { name: /match case/i }).click();
  await expect(bar.getByText("1 of 1")).toBeVisible();
});

test("replace all changes the document, and undoes in one step", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("replace"));
  await openNewDocument(page);
  await write(page, "The cat sat. The cat ran. The cat slept.");

  await page.keyboard.press("Control+h");
  const bar = page.getByRole("search", { name: /find in document/i });
  await bar.getByRole("textbox", { name: "Find" }).fill("cat");
  await expect(bar.getByText("1 of 3")).toBeVisible();

  await bar.getByLabel(/replace with/i).fill("dog");
  await bar.getByRole("button", { name: /^replace all$/i }).click();

  await expect(body(page)).toContainText("The dog sat. The dog ran. The dog slept.");
  await expect(body(page)).not.toContainText("cat");

  // One transaction, so one undo. Undoing a 200-match replace should not be 200
  // keystrokes.
  await body(page).click();
  await page.keyboard.press("Control+z");
  await expect(body(page)).toContainText("The cat sat. The cat ran. The cat slept.");
});

test("escape closes find and leaves no highlights behind", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("find-esc"));
  await openNewDocument(page);
  await write(page, "Something findable here.");

  await page.keyboard.press("Control+f");
  const bar = page.getByRole("search", { name: /find in document/i });
  await bar.getByRole("textbox", { name: "Find" }).fill("findable");
  await expect(page.locator(".folium-find")).toHaveCount(1);

  await page.keyboard.press("Escape");

  await expect(bar).toBeHidden();
  // Left behind, they would mark up a document for a search nobody is doing.
  await expect(page.locator(".folium-find")).toHaveCount(0);
});

test("the outline lists headings and jumps to one", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("outline"));
  await openNewDocument(page);

  // No headings, no outline — rather than an empty panel promising a structure
  // the document has not got.
  await expect(page.getByRole("navigation", { name: /document outline/i })).toHaveCount(0);

  await body(page).click();
  await body(page).pressSequentially("# Introduction\n");
  await body(page).pressSequentially("Some prose here.\n");
  await body(page).pressSequentially("## Background\n");
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  const outline = page.getByRole("navigation", { name: /document outline/i });
  await expect(outline).toBeVisible();
  await expect(outline.getByRole("button", { name: "Introduction" })).toBeVisible();
  await expect(outline.getByRole("button", { name: "Background" })).toBeVisible();

  await outline.getByRole("button", { name: "Introduction" }).click();
  await expect(body(page)).toBeFocused();
});

test("the statistics line counts the document and the selection", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("stats"));
  await openNewDocument(page);
  await write(page, "one two three four five");

  const stats = page.getByRole("status", { name: /document statistics/i });
  await expect(stats).toContainText("5 words");
  await expect(stats).toContainText("1 min read");

  // Selecting changes the answer, which is what Word does.
  await body(page).click();
  await page.keyboard.press("Control+a");
  await expect(stats).toContainText("5 words selected");
});

test("change case cycles the selection", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("case"));
  await openNewDocument(page);
  await write(page, "the rise and fall of the roman empire");

  await body(page).click();
  await page.keyboard.press("Control+a");
  await page.getByRole("button", { name: /change case/i }).click();

  // Title Case leaves the small words alone, except first and last — the naive
  // version gives "The Rise And Fall Of The Roman Empire".
  await expect(body(page)).toContainText("The Rise and Fall of the Roman Empire");
});

test("a viewer gets find and no replace", async ({ page, browser }) => {
  test.slow();

  const viewerEmail = uniqueEmail("find-viewer");
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await signUp(viewer, viewerEmail);

  await signUp(page, uniqueEmail("find-owner"));
  const url = await openNewDocument(page);
  await write(page, "Something worth finding.");

  await page.getByRole("button", { name: /share/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /email/i }).fill(viewerEmail);
  await dialog.getByRole("combobox", { name: /permission for the new/i }).selectOption("view");
  await dialog.getByRole("button", { name: /^share$/i }).click();
  await expect(dialog.getByText(viewerEmail)).toBeVisible();

  await viewer.goto(url);
  // Opened with the button rather than the shortcut, which is both what a
  // viewer would actually reach for and the only discoverable way in: Ctrl+F is
  // the browser's shortcut being taken over, and nobody guesses that.
  await viewer.getByRole("button", { name: /^find$/i }).click();
  const bar = viewer.getByRole("search", { name: /find in document/i });
  await expect(bar).toBeVisible();

  await bar.getByRole("textbox", { name: "Find" }).fill("finding");
  await expect(bar.getByText("1 of 1")).toBeVisible();
  // Replace writes the document, so it is not offered to someone who may not.
  await expect(bar.getByRole("button", { name: /replace/i })).toHaveCount(0);

  await viewerContext.close();
});
