import { expect, test, type Page } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

/** Creating a document leaves you on the dashboard, which is where every
 *  assertion here lives. */
async function newDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();
}

async function createFolder(page: Page, name: string) {
  await page.getByRole("button", { name: /manage folders/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/new folder name/i).fill(name);
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByText(name, { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

function rail(page: Page) {
  return page.getByRole("navigation", { name: /sections/i });
}

test("a document can be filed, found by folder, and unfiled", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail());
  await newDocument(page);
  await createFolder(page, "Clients");

  const clients = rail(page).getByRole("link", { name: /Clients/ });
  await expect(clients).toBeVisible();

  await page.getByRole("combobox", { name: /folder/i }).selectOption({ label: "Clients" });
  // The count in the rail is the proof the server took it, rather than the
  // select merely showing what was clicked.
  await expect(clients).toContainText("1");

  await clients.click();
  await expect(page).toHaveURL(/folder=/);
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  // Unfiled is the complement, and the document is no longer in it.
  await rail(page).getByRole("link", { name: /Unfiled/ }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeHidden();

  await rail(page).getByRole("link", { name: "Documents" }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  await page
    .getByRole("combobox", { name: /folder/i })
    .selectOption({ label: "No folder" });
  await expect(clients).not.toContainText("1");
});

test("deleting a folder keeps the documents in it", async ({ page }) => {
  // The decision this feature turns on. Reorganising must never destroy work,
  // and there is already a trash for deleting.
  test.slow();

  await signUp(page, uniqueEmail("keep"));
  await newDocument(page);
  await createFolder(page, "Scratch");

  await page.getByRole("combobox", { name: /folder/i }).selectOption({ label: "Scratch" });
  const scratch = rail(page).getByRole("link", { name: /Scratch/ });
  await expect(scratch).toContainText("1");

  await page.getByRole("button", { name: /manage folders/i }).click();
  const dialog = page.getByRole("dialog");
  // Asked first: one click never destroys an organisation built by hand.
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(dialog.getByText("Scratch")).toBeHidden();
  await page.keyboard.press("Escape");

  await expect(scratch).toBeHidden();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();
});

test("a folder can be renamed, and two cannot share a name", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("rename"));
  await createFolder(page, "Clients");

  await page.getByRole("button", { name: /manage folders/i }).click();
  const dialog = page.getByRole("dialog");

  // The name is taken, and the server says so in its own words.
  await dialog.getByLabel(/new folder name/i).fill("Clients");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByText(/already have a folder with that name/i)).toBeVisible();

  await dialog.getByRole("button", { name: "Rename" }).click();
  await dialog.getByLabel(/rename clients/i).fill("Client work");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Client work")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(rail(page).getByRole("link", { name: /Client work/ })).toBeVisible();
});

test("a shared document offers no folder control", async ({ page, browser }) => {
  // Filing is organisation, not access — and a document someone else owns is
  // not yours to file. The backend refuses it, so offering the control would
  // be a lie.
  test.slow();

  const friendEmail = uniqueEmail("friend");
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();

  await signUp(friend, friendEmail);
  await newDocument(friend);
  await createFolder(friend, "Mine");

  await signUp(page, uniqueEmail("owner"));
  await newDocument(page);
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);

  await page.getByRole("button", { name: /share/i }).click();
  const shareDialog = page.getByRole("dialog");
  await shareDialog.getByRole("textbox", { name: /email/i }).fill(friendEmail);
  await shareDialog.getByRole("button", { name: /^share$/i }).click();
  await expect(shareDialog.getByText(friendEmail)).toBeVisible();

  await friend.reload();
  await expect(friend.getByText(/shared with you/i)).toBeVisible();
  // The friend has a folder and a document of their own, so exactly one folder
  // control is correct: theirs. A second would be on the shared card.
  await expect(friend.getByRole("combobox", { name: /folder/i })).toHaveCount(1);

  await friendContext.close();
});
