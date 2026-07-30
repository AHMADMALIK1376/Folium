import { expect, test, type Page } from "@playwright/test";

/** A fresh account per run, so the suite stays idempotent and
 *  backend/scripts/clean_test_data.py can remove what it creates. */
function uniqueEmail(role: string) {
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

/** The journey that could not be tested before this phase: nothing in the UI
 *  could create a `view` permission, so 2C-ii's read-only editor rested on unit
 *  tests alone. Two browser contexts, so both sessions are live at once. */
test("an owner grants view, then edit, then revokes it", async ({ browser }) => {
  // Two sign-ups, a share, a permission change, edits from both sides and a
  // revoke, each a round trip to a hosted database. It genuinely needs more than
  // the standard budget; splitting it would only pay for two more sign-ups.
  test.slow();

  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();

  const guestEmail = uniqueEmail("guest");

  await signUp(owner, uniqueEmail("owner"));
  await signUp(guest, guestEmail);

  // A new account is told where shared documents will appear, rather than being
  // shown an unexplained blank.
  await expect(guest.getByText(/documents other people share/i)).toBeVisible();

  // The owner creates a document and shares it, view only.
  await owner.getByRole("button", { name: /new document/i }).click();
  await owner.getByRole("link", { name: /untitled document/i }).click();
  await expect(owner).toHaveURL(/\/documents\//);
  const documentUrl = owner.url();

  await owner.getByRole("button", { name: /share/i }).click();
  const dialog = owner.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/not shared with anyone/i)).toBeVisible();

  await dialog.getByRole("textbox", { name: /email/i }).fill(guestEmail);
  await dialog
    .getByRole("combobox", { name: /permission for the new/i })
    .selectOption("view");
  await dialog.getByRole("button", { name: /^share$/i }).click();
  await expect(dialog.getByText(guestEmail)).toBeVisible();

  // The guest sees it, and cannot edit it.
  await guest.goto("/dashboard");
  await guest.getByRole("link", { name: /untitled document/i }).click();
  await expect(guest.getByText(/read-only/i)).toBeVisible();
  await expect(guest.getByRole("button", { name: /bold/i })).toHaveCount(0);
  await expect(guest.getByRole("textbox", { name: /document title/i })).toHaveCount(0);

  // Upgraded to edit. Waiting on the response rather than on the select is not
  // belt-and-braces: selectOption fires the change and returns immediately, so
  // without this the guest reloads before the server has the new permission and
  // sees a read-only document that is about to become editable.
  await Promise.all([
    owner.waitForResponse(
      (response) =>
        response.url().includes("/shares/") &&
        response.request().method() === "PATCH" &&
        response.ok(),
    ),
    owner
      .getByRole("combobox", { name: /permission for/i })
      .first()
      .selectOption("edit"),
  ]);
  await expect(dialog.getByText(guestEmail)).toBeVisible();

  await guest.reload();
  await expect(guest.getByText(/read-only/i)).toHaveCount(0);
  const body = guest.getByRole("textbox", { name: /document body/i });
  await body.click();
  await guest.keyboard.type("Written by the collaborator");
  await expect(guest.getByRole("status")).toHaveText(/^saved$/i);

  // The owner sees the collaborator's text.
  await owner.keyboard.press("Escape");
  await owner.reload();
  await expect(owner.getByText(/written by the collaborator/i)).toBeVisible();

  // Revoked.
  await owner.getByRole("button", { name: /share/i }).click();
  await owner.getByRole("dialog").getByRole("button", { name: /remove/i }).click();
  await expect(owner.getByRole("dialog").getByText(/not shared with anyone/i)).toBeVisible();

  await guest.goto("/dashboard");
  await expect(guest.getByRole("link", { name: /untitled document/i })).toHaveCount(0);

  // And the document itself is no longer reachable, with the same message a
  // document that never existed would give.
  await guest.goto(documentUrl);
  await expect(guest.getByText(/does not exist, or you do not have access/i)).toBeVisible();

  await ownerContext.close();
  await guestContext.close();
});

test("sharing with an address that has no account says so", async ({ page }) => {
  await signUp(page, uniqueEmail("owner"));

  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();

  await page.getByRole("button", { name: /share/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: /email/i })
    .fill("definitely-not-registered@example.com");
  await dialog.getByRole("button", { name: /^share$/i }).click();

  // The backend's own wording, because an owner who mistyped needs to know the
  // share did not happen.
  await expect(dialog.getByRole("alert")).toContainText(/no user with that email/i);
});

test("a collaborator gets no Share control", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();

  const guestEmail = uniqueEmail("guest");
  await signUp(owner, uniqueEmail("owner"));
  await signUp(guest, guestEmail);

  await owner.getByRole("button", { name: /new document/i }).click();
  await owner.getByRole("link", { name: /untitled document/i }).click();
  await owner.getByRole("button", { name: /share/i }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /email/i }).fill(guestEmail);
  await dialog
    .getByRole("combobox", { name: /permission for the new/i })
    .selectOption("edit");
  await dialog.getByRole("button", { name: /^share$/i }).click();
  await expect(dialog.getByText(guestEmail)).toBeVisible();

  await guest.goto("/dashboard");
  await guest.getByRole("link", { name: /untitled document/i }).click();

  // An editor may write but not administer: the backend 404s share mutations
  // from anyone but the owner, so offering the control would only mislead.
  await expect(guest.getByRole("textbox", { name: /document body/i })).toBeVisible();
  await expect(guest.getByRole("button", { name: /share/i })).toHaveCount(0);

  await ownerContext.close();
  await guestContext.close();
});
