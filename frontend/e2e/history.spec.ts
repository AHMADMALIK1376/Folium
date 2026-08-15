import { expect, test, type Page } from "@playwright/test";

function uniqueEmail(role: string) {
  return `e2e-hist-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-password-123";

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function typeInto(page: Page, text: string) {
  const body = page.getByRole("textbox", { name: /document body/i });
  await body.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
}

/** Share the open document with `email`, at `permission`. */
async function shareWith(page: Page, email: string, permission: "view" | "edit") {
  await page.getByRole("button", { name: /^share$/i }).click();
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

/** A version only exists after a snapshot, and snapshots are rate-limited to one
 *  per five minutes per author. Two authors defeat that honestly — a different
 *  author always snapshots — rather than by making the interval configurable for
 *  tests, which would mean testing behaviour the product does not have. */
test("an earlier draft can be previewed and restored", async ({ browser }) => {
  test.slow();

  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();

  const guestEmail = uniqueEmail("guest");
  await signUp(owner, uniqueEmail("owner"));
  await signUp(guest, guestEmail);

  await owner.getByRole("button", { name: /new document/i }).click();
  await owner.getByRole("link", { name: /untitled document/i }).click();
  await expect(owner).toHaveURL(/\/documents\//);

  await typeInto(owner, "First draft by the owner");
  await shareWith(owner, guestEmail, "edit");

  // The guest's save snapshots the owner's text, because the last version was
  // written by someone else.
  await guest.goto("/dashboard");
  await guest.getByRole("link", { name: /untitled document/i }).click();
  await typeInto(guest, "Replaced by the collaborator");

  await owner.reload();
  await expect(owner.getByText(/replaced by the collaborator/i)).toBeVisible();

  await owner.getByRole("button", { name: /history/i }).click();
  const dialog = owner.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Preview before restoring, so nobody restores blind.
  await dialog.getByRole("button", { name: /e2e-hist/i }).first().click();
  await expect(dialog.getByText(/first draft by the owner/i)).toBeVisible();

  await dialog.getByRole("button", { name: /^restore$/i }).click();

  // In place: the editor holds the content, so a restore that needed a reload
  // would be a worse product, not just a slower test.
  await expect(dialog).toBeHidden();
  await expect(owner.getByText(/first draft by the owner/i)).toBeVisible();
  await expect(owner.getByText(/replaced by the collaborator/i)).toHaveCount(0);

  await expect(owner.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
  await owner.reload();
  await expect(owner.getByText(/first draft by the owner/i)).toBeVisible();

  await ownerContext.close();
  await guestContext.close();
});

test("a viewer can read the history but not restore", async ({ browser }) => {
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
  await typeInto(owner, "Only draft");

  await shareWith(owner, guestEmail, "edit");

  // An edit from the guest creates the version, then the owner downgrades them.
  await guest.goto("/dashboard");
  await guest.getByRole("link", { name: /untitled document/i }).click();
  await typeInto(guest, "Guest edit");

  await owner.getByRole("button", { name: /^share$/i }).click();
  const shareDialog = owner.getByRole("dialog");
  await Promise.all([
    owner.waitForResponse(
      (response) =>
        response.url().includes("/shares/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    ),
    shareDialog
      .getByRole("combobox", { name: /permission for/i })
      .first()
      .selectOption("view"),
  ]);
  await owner.keyboard.press("Escape");

  await guest.reload();
  await expect(guest.getByText(/read-only/i)).toBeVisible();

  await guest.getByRole("button", { name: /history/i }).click();
  const dialog = guest.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: /e2e-hist/i }).first().click();
  await expect(dialog.getByText(/only draft/i)).toBeVisible();
  // Reading history is fine — they can already read the document. Restoring is
  // an edit, and the backend refuses it, so the control is not offered.
  await expect(dialog.getByRole("button", { name: /^restore$/i })).toHaveCount(0);

  await ownerContext.close();
  await guestContext.close();
});
