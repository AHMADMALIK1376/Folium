import { expect, test, type Page } from "@playwright/test";

/** The app on a phone.
 *
 * Phase 11 made the shell and the toolbars responsive and said plainly that
 * none of it had been looked at on a phone. This looks. The assertion that
 * carries the weight is the horizontal-overflow check: a page whose content is
 * wider than its viewport is the classic mobile failure, it is invisible on a
 * desktop, and it is objectively detectable.
 *
 * The screenshots are for a person to look at, and are written to
 * test-results/mobile/. */

test.use({ viewport: { width: 375, height: 812 } });

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

/** Nothing may stick out sideways.
 *
 * Measured rather than eyeballed: a few pixels of overflow is enough to make
 * the whole page pan and not enough to notice in a screenshot.
 *
 * Two measurements, not one. The document element catches page overflow — and
 * misses dialogs entirely, because a `position: fixed` element does not extend
 * the document's scroll width. The folders dialog was 459px of content inside a
 * 343px box, painting text and buttons past its own edge, and the first version
 * of this check called it fine. Any open dialog is now measured against itself.
 */
async function expectNoSidewaysScroll(page: Page, where: string) {
  const dialogs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot="dialog-content"]')).map((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    })),
  );
  for (const dialog of dialogs) {
    expect(
      dialog.scrollWidth,
      `${where}: an open dialog holds ${dialog.scrollWidth}px of content in a ${dialog.clientWidth}px box`,
    ).toBeLessThanOrEqual(dialog.clientWidth + 1);
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    widest: (() => {
      let worst = { tag: "", width: 0 };
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const rect = el.getBoundingClientRect();
        if (rect.right > worst.width) {
          worst = {
            tag: `${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)}`,
            width: Math.round(rect.right),
          };
        }
      }
      return worst;
    })(),
  }));

  expect(
    overflow.scrollWidth,
    `${where} scrolls sideways; widest element ${overflow.widest.tag} reaches ${overflow.widest.width}px`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test("the dashboard fits a phone", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("mob-dash"));
  await page.getByRole("button", { name: /new document/i }).click();
  await expect(page.getByRole("link", { name: /untitled document/i })).toBeVisible();

  // With a folder, so the rail and the per-card folder control are both on
  // screen — the densest the dashboard row ever gets.
  await page.getByRole("button", { name: /manage folders/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/new folder name/i).fill("Clients");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByText("Clients")).toBeVisible();
  await page.keyboard.press("Escape");
  // Waited out rather than raced: the dialog fades, and a screenshot taken
  // mid-animation shows it ghosted over the page. These exist to be looked at.
  await expect(dialog).toBeHidden();

  await page.screenshot({ path: "test-results/mobile/dashboard.png", fullPage: true });
  await expectNoSidewaysScroll(page, "the dashboard");
});

test("the folder dialog fits a phone", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("mob-folder"));
  await page.getByRole("button", { name: /manage folders/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/new folder name/i).fill("A folder with a fairly long name");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog.getByText(/a folder with a fairly long name/i)).toBeVisible();

  await page.screenshot({ path: "test-results/mobile/folder-dialog.png" });
  await expectNoSidewaysScroll(page, "the folder dialog");
});

test("the editor and its toolbars fit a phone", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("mob-editor"));
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);

  const body = page.getByRole("textbox", { name: /document body/i });
  await body.click();
  await body.pressSequentially("A paragraph to give the editor something to lay out.");
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await page.screenshot({ path: "test-results/mobile/editor.png", fullPage: true });
  await expectNoSidewaysScroll(page, "the editor");
});

test("the comments panel fits a phone", async ({ page }) => {
  // The newest surface, and the one Phase 14 shipped without looking at.
  test.slow();

  await signUp(page, uniqueEmail("mob-comments"));
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);

  const panel = page.getByRole("region", { name: /comments/i });
  await panel.getByLabel(/write a comment/i).fill(
    "A comment long enough to wrap on a narrow screen, which is the case worth looking at.",
  );
  await panel.getByRole("button", { name: /^comment$/i }).click();
  await expect(panel.getByText(/a comment long enough to wrap/i)).toBeVisible();

  await panel.getByRole("button", { name: /^reply$/i }).click();
  await panel.getByLabel(/write a reply/i).fill("And a reply beneath it");
  await panel.getByRole("button", { name: /^reply$/i }).click();
  await expect(panel.getByText("And a reply beneath it")).toBeVisible();

  await page.screenshot({ path: "test-results/mobile/comments.png", fullPage: true });
  await expectNoSidewaysScroll(page, "the comments panel");
});

test("the share dialog fits a phone", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("mob-share"));
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await page.getByRole("button", { name: /share/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.screenshot({ path: "test-results/mobile/share-dialog.png" });
  await expectNoSidewaysScroll(page, "the share dialog");
});
