import { expect, test, type Page } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

async function openNewDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);
  return page.url();
}

async function shareWith(page: Page, email: string, permission: string) {
  await page.getByRole("button", { name: /share/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /email/i }).fill(email);
  await dialog
    .getByRole("combobox", { name: /permission for the new/i })
    .selectOption(permission);
  await dialog.getByRole("button", { name: /^share$/i }).click();
  await expect(dialog.getByText(email)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

function bell(page: Page) {
  return page.getByRole("button", { name: /notifications/i });
}

/** Assert what the bell says, with the patience the design actually promises.
 *
 * Notifications are delivered by polling, and the stated contract is "within a
 * minute is fine". The count is refreshed on mount so this is normally
 * instant — but the bell cannot ask until the Supabase client has a session,
 * and on a cold load under a long suite that takes a moment. Asserting in the
 * suite's default 15s is stricter than the product, so this waits longer.
 * Still well inside the minute, so a genuinely broken bell still fails. */
function expectBell(page: Page, pattern: RegExp) {
  return expect(bell(page)).toHaveAccessibleName(pattern, { timeout: 30_000 });
}

test("being shared a document, and being commented at, both ring the bell", async ({
  page,
  browser,
}) => {
  test.slow();

  const friendEmail = uniqueEmail("notif-friend");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await signUp(friend, friendEmail);

  await signUp(page, uniqueEmail("notif-owner"));
  const url = await openNewDocument(page);
  await shareWith(page, friendEmail, "comment");

  // The share itself is news.
  await friend.reload();
  await expectBell(friend, /1 unread/);

  await bell(friend).click();
  await expect(friend.getByText(/shared a document with you/i)).toBeVisible();

  // Following it goes to the document and clears that one.
  await friend.getByRole("menuitem").first().click();
  await expect(friend).toHaveURL(/\/documents\//);
  await expectBell(friend, /^Notifications$/);

  // Now the friend comments, and the owner hears about it.
  const panel = friend.getByRole("region", { name: /comments/i });
  await panel.getByLabel(/write a comment/i).fill("A question about this");
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(panel.getByText("A question about this")).toBeVisible();

  // Checked from the dashboard, which is where someone would be when they
  // notice the bell — and a different URL from the one the owner is already on.
  await page.goto("/dashboard");
  await expectBell(page, /1 unread/);
  await bell(page).click();
  await expect(page.getByText(/commented$/i)).toBeVisible();

  await friendContext.close();
});

test("nobody is notified about their own comment", async ({ page }) => {
  // The rule most likely to be got wrong, and the most obviously wrong when it
  // is.
  test.slow();

  await signUp(page, uniqueEmail("notif-self"));
  await openNewDocument(page);

  const panel = page.getByRole("region", { name: /comments/i });
  await panel.getByLabel(/write a comment/i).fill("A note to myself");
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(panel.getByText("A note to myself")).toBeVisible();

  await page.reload();
  await expectBell(page, /^Notifications$/);
});

test("a mention reaches the person named", async ({ page, browser }) => {
  test.slow();

  const friendEmail = uniqueEmail("notif-mention");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await signUp(friend, friendEmail);
  // The display name a new account gets is the local part of its address.
  const friendName = friendEmail.split("@")[0];

  await signUp(page, uniqueEmail("notif-mentioner"));
  const url = await openNewDocument(page);
  await shareWith(page, friendEmail, "comment");

  const panel = page.getByRole("region", { name: /comments/i });
  const box = panel.getByLabel(/write a comment/i);
  await box.click();
  await box.pressSequentially("Over to @");

  // The picker offers people who can already see the document, and nobody else.
  const options = page.getByRole("listbox", { name: /people you can mention/i });
  await expect(options).toBeVisible();
  await options.getByRole("option", { name: friendName }).click();

  await box.pressSequentially("what do you think?");
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(panel.getByText(/what do you think\?/i)).toBeVisible();

  await friend.goto(url);
  // Two: being shared the document, and being mentioned in it. Both are news.
  await expectBell(friend, /2 unread/);
  await bell(friend).click();
  // A mention, not a comment: the more specific kind wins.
  await expect(friend.getByText(/mentioned you/i)).toBeVisible();
  await expect(friend.getByText(/shared a document with you/i)).toBeVisible();

  await friendContext.close();
});

test("mark all read clears the bell", async ({ page, browser }) => {
  test.slow();

  const friendEmail = uniqueEmail("notif-markall");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await signUp(friend, friendEmail);

  await signUp(page, uniqueEmail("notif-owner2"));
  const url = await openNewDocument(page);
  await shareWith(page, friendEmail, "comment");

  await friend.goto(url);
  const panel = friend.getByRole("region", { name: /comments/i });
  for (const text of ["First remark", "Second remark"]) {
    await panel.getByLabel(/write a comment/i).fill(text);
    await panel.getByRole("button", { name: /^comment$/i }).click();
    await expect(panel.getByText(text)).toBeVisible();
  }

  await page.goto(url);
  await expectBell(page, /2 unread/);

  await bell(page).click();
  await page.getByRole("button", { name: /mark all read/i }).click();

  await expectBell(page, /^Notifications$/);
  await expect(page.getByRole("button", { name: /mark all read/i })).toHaveCount(0);

  await friendContext.close();
});

test("a notification does not outlive the access it was made under", async ({
  page,
  browser,
}) => {
  // The rule that makes this safe: the row still holds a document title.
  test.slow();

  const friendEmail = uniqueEmail("notif-revoked");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  await signUp(friend, friendEmail);

  await signUp(page, uniqueEmail("notif-owner3"));
  await openNewDocument(page);
  await shareWith(page, friendEmail, "comment");

  await friend.goto("/dashboard");
  await expectBell(friend, /1 unread/);

  // Revoke it.
  await page.getByRole("button", { name: /share/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /remove/i }).click();
  await expect(dialog.getByText(/not shared with anyone/i)).toBeVisible();

  await friend.goto("/dashboard");
  await expectBell(friend, /^Notifications$/);
  await bell(friend).click();
  await expect(friend.getByText(/appear here/i)).toBeVisible();

  await friendContext.close();
});
