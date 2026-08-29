import { expect, test, type Page } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

/** The whole phase, in one test.
 *
 * Every unit test around collaboration can pass while the real thing is broken:
 * the failure modes are timing, sync, and duplication, and none of them appear
 * against a mocked provider. This runs two real browsers against a real y-sweet.
 *
 * Skipped rather than failed when no collaboration server is configured — the
 * feature is optional, and the rest of the suite must still pass for anyone who
 * has not started one.
 */
const CONFIGURED = Boolean(process.env.Y_SWEET_CONNECTION_STRING);

test.describe(() => {
  test.skip(
    !CONFIGURED,
    "Set Y_SWEET_CONNECTION_STRING and run `y-sweet serve` to exercise collaboration",
  );

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

  test("two people edit one document at the same time", async ({ browser }) => {
    test.slow();

    const ownerContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const guest = await guestContext.newPage();

    const guestEmail = uniqueEmail("collab-guest");
    await signUp(owner, uniqueEmail("collab-owner"));
    await signUp(guest, guestEmail);

    await owner.getByRole("button", { name: /new document/i }).click();
    await owner.getByRole("link", { name: /untitled document/i }).click();
    await expect(owner).toHaveURL(/\/documents\//);

    const ownerBody = owner.getByRole("textbox", { name: /document body/i });
    await ownerBody.click();
    await owner.keyboard.type("Written by the owner. ");
    await expect(owner.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

    await shareWith(owner, guestEmail, "edit");

    await guest.goto("/dashboard");
    await guest.getByRole("link", { name: /untitled document/i }).click();
    const guestBody = guest.getByRole("textbox", { name: /document body/i });

    // The owner's text reaches the guest through the room, not through a reload.
    await expect(guestBody).toContainText("Written by the owner.");

    // And it appears exactly once. Seeding before the provider has synced would
    // insert it once per client, which is the failure this phase is built around.
    const occurrences = (await guestBody.innerText()).split("Written by the owner.").length - 1;
    expect(occurrences).toBe(1);

    // Both editors say they are live rather than staying silent about it.
    await expect(owner.getByText(/^live$/i)).toBeVisible();
    await expect(guest.getByText(/^live$/i)).toBeVisible();

    // Now the other direction, live, with no reload on either side.
    await guestBody.click();
    await guest.keyboard.press("End");
    await guest.keyboard.type("And by the collaborator.");

    await expect(ownerBody).toContainText("And by the collaborator.");

    // Both carets have to be live for each side to render the other's label — a
    // remote cursor is only drawn while that person holds a selection — so the
    // owner types again before either is asserted.
    await ownerBody.click();
    await owner.keyboard.type("!");

    // Each caret carries its own person's name. Phase 4-i labelled every cursor
    // with the document owner's, so on a shared document everyone appeared as
    // whoever created it — this is the assertion that would have caught it.
    await expect(owner.locator(".collaboration-cursor__label").first()).toContainText(
      /e2e-collab-guest/i,
    );
    await expect(guest.locator(".collaboration-cursor__label").first()).toContainText(
      /e2e-collab-owner/i,
    );

    // Both texts survive a reload, which means the merged document reached
    // Postgres rather than living only in the room.
    await owner.reload();
    await expect(owner.getByRole("textbox", { name: /document body/i })).toContainText(
      "And by the collaborator.",
    );

    await ownerContext.close();
    await guestContext.close();
  });

  test("a viewer sees live edits and contributes none", async ({ browser }) => {
    test.slow();

    const ownerContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const guest = await guestContext.newPage();

    const guestEmail = uniqueEmail("collab-viewer");
    await signUp(owner, uniqueEmail("collab-owner"));
    await signUp(guest, guestEmail);

    await owner.getByRole("button", { name: /new document/i }).click();
    await owner.getByRole("link", { name: /untitled document/i }).click();
    await owner.getByRole("textbox", { name: /document body/i }).click();
    await owner.keyboard.type("Only the owner may write this.");
    await expect(owner.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

    await shareWith(owner, guestEmail, "view");

    await guest.goto("/dashboard");
    await guest.getByRole("link", { name: /untitled document/i }).click();
    await expect(guest.getByText(/read-only/i)).toBeVisible();
    await expect(guest.getByRole("textbox", { name: /document body/i })).toContainText(
      "Only the owner may write this.",
    );

    // Live updates still reach them — reading is the point of a view share.
    await owner.getByRole("textbox", { name: /document body/i }).click();
    await owner.keyboard.press("End");
    await owner.keyboard.type(" Appended.");
    await expect(guest.getByRole("textbox", { name: /document body/i })).toContainText(
      "Appended.",
    );

    await expect(guest.getByRole("button", { name: /bold/i })).toHaveCount(0);

    await ownerContext.close();
    await guestContext.close();
  });
});
