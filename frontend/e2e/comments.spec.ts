import { expect, test, type Page } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

async function openNewDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);
  return page.url();
}

async function type(page: Page, text: string) {
  const body = page.getByRole("textbox", { name: /document body/i });
  await body.click();
  await body.pressSequentially(text);
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
}

function comments(page: Page) {
  return page.getByRole("region", { name: /comments/i });
}

test("a comment on the whole document, replied to and resolved", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("author"));
  await openNewDocument(page);

  const panel = comments(page);
  await expect(panel.getByText(/select a passage and comment on it/i)).toBeVisible();

  await panel.getByLabel(/write a comment/i).fill("Does this need a summary?");
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(panel.getByText("Does this need a summary?")).toBeVisible();

  await panel.getByRole("button", { name: /^reply$/i }).click();
  await panel.getByLabel(/write a reply/i).fill("Probably not");
  await panel.getByRole("button", { name: /^reply$/i }).click();
  await expect(panel.getByText("Probably not")).toBeVisible();

  await panel.getByRole("button", { name: /^resolve$/i }).click();
  // Kept, collapsed behind a count: a resolved thread is a record of a
  // decision, not rubbish.
  await expect(panel.getByRole("button", { name: /show 1 resolved/i })).toBeVisible();
  await expect(panel.getByText("Does this need a summary?")).toBeHidden();

  await panel.getByRole("button", { name: /show 1 resolved/i }).click();
  await expect(panel.getByText("Does this need a summary?")).toBeVisible();
});

test("a comment anchors to a passage, and says so when the passage is gone", async ({
  page,
}) => {
  // The decision the whole phase turns on: the anchor is a quote, not an offset
  // and not a mark. Editing above it must not move it, and deleting it must not
  // silently reattach the comment somewhere plausible.
  test.slow();

  await signUp(page, uniqueEmail("anchor"));
  await openNewDocument(page);
  await type(page, "The budget constraint is the interesting part.");

  const body = page.getByRole("textbox", { name: /document body/i });
  // Select "budget constraint" by double-clicking a word and extending.
  await page.getByText("The budget constraint is the interesting part.").click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 17; i += 1) await page.keyboard.press("Shift+ArrowRight");

  const panel = comments(page);
  await expect(panel.getByText(/on “budget constraint”/i)).toBeVisible();
  await panel.getByLabel(/write a comment/i).fill("Which constraint?");
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(panel.getByText("Which constraint?")).toBeVisible();

  // The passage is highlighted in the document — a decoration, so nothing in
  // the content changed to put it there.
  await expect(page.locator(".folium-comment")).toHaveText("budget constraint");

  // Typing above it must not move it. This is what an offset anchor would get
  // wrong, and the reason this is a quote.
  await body.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("A new sentence first. ");
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
  await expect(page.locator(".folium-comment")).toHaveText("budget constraint");

  // Now rewrite the passage itself. The thread survives and admits it lost its
  // place, rather than highlighting the nearest plausible text.
  //
  // Clicked through the highlight rather than by text: the panel quotes the
  // same words, so a page-wide text match finds two elements.
  await page.locator(".folium-comment").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Nothing of the kind remains here.");
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await expect(panel.getByText(/the text this was about has changed/i)).toBeVisible();
  await expect(panel.getByText("Which constraint?")).toBeVisible();
  await expect(page.locator(".folium-comment")).toHaveCount(0);
});

test("a commenter can comment and cannot edit the document", async ({ page, browser }) => {
  // The permission has existed since Phase 1 and did nothing until now.
  test.slow();

  const friendEmail = uniqueEmail("commenter");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await signUp(friend, friendEmail);

  await signUp(page, uniqueEmail("owner"));
  const url = await openNewDocument(page);
  await type(page, "A document worth discussing.");

  await page.getByRole("button", { name: /share/i }).click();
  const shareDialog = page.getByRole("dialog");
  await shareDialog.getByRole("textbox", { name: /email/i }).fill(friendEmail);
  await shareDialog
    .getByRole("combobox", { name: /permission for the new/i })
    .selectOption("comment");
  await shareDialog.getByRole("button", { name: /^share$/i }).click();
  await expect(shareDialog.getByText(friendEmail)).toBeVisible();
  await page.keyboard.press("Escape");

  await friend.goto(url);
  // Told what they can do, rather than that the document is read-only.
  await expect(friend.getByText(/shared this with you for commenting/i)).toBeVisible();
  // No toolbar: commenting is not editing.
  await expect(friend.getByRole("button", { name: /^bold$/i })).toHaveCount(0);

  const panel = comments(friend);
  await panel.getByLabel(/write a comment/i).fill("A remark from someone who cannot edit");
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(panel.getByText("A remark from someone who cannot edit")).toBeVisible();

  // The owner sees it, may delete it, and is not offered a way to rewrite it.
  await page.reload();
  const ownerPanel = comments(page);
  await expect(ownerPanel.getByText("A remark from someone who cannot edit")).toBeVisible();
  await expect(ownerPanel.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
  await expect(ownerPanel.getByRole("button", { name: /^delete$/i })).toBeVisible();

  await friendContext.close();
});

test("a viewer reads the discussion and cannot join it", async ({ page, browser }) => {
  test.slow();

  const viewerEmail = uniqueEmail("viewer");
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await signUp(viewer, viewerEmail);

  await signUp(page, uniqueEmail("owner2"));
  const url = await openNewDocument(page);

  const panel = comments(page);
  await panel.getByLabel(/write a comment/i).fill("Worth reading");
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(panel.getByText("Worth reading")).toBeVisible();

  await page.getByRole("button", { name: /share/i }).click();
  const shareDialog = page.getByRole("dialog");
  await shareDialog.getByRole("textbox", { name: /email/i }).fill(viewerEmail);
  await shareDialog
    .getByRole("combobox", { name: /permission for the new/i })
    .selectOption("view");
  await shareDialog.getByRole("button", { name: /^share$/i }).click();
  await expect(shareDialog.getByText(viewerEmail)).toBeVisible();

  await viewer.goto(url);
  const viewerPanel = comments(viewer);
  // Reading a discussion about a document is part of reading the document.
  await expect(viewerPanel.getByText("Worth reading")).toBeVisible();
  await expect(viewerPanel.getByLabel(/write a comment/i)).toHaveCount(0);
  await expect(viewerPanel.getByRole("button", { name: /^resolve$/i })).toHaveCount(0);

  await viewerContext.close();
});
