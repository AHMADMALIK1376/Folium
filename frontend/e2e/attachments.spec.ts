import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { signUp, uniqueEmail } from "./support/auth";

/** Attaching files, against a real Supabase Storage bucket.
 *
 * Skipped when the backend has no service-role key — but the flag is the
 * **application's own answer**, not an environment variable this process reads.
 * `collaboration.spec.ts` gates on `process.env.Y_SWEET_CONNECTION_STRING`, so
 * running it in a shell that lacks the variable skips both of its tests while
 * reporting success, even with a server running and the backend configured. The
 * panel's presence cannot lie in that way: it is rendered from the flag the
 * backend put on the document.
 */

const FILE_TEXT = "Attachment contents that must survive the round trip.\n";

function textFile(name = "notes.txt"): string {
  const path = join(mkdtempSync(join(tmpdir(), "folium-e2e-")), name);
  writeFileSync(path, FILE_TEXT, "utf-8");
  return path;
}

async function newDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);
}

/** Skip unless this deployment can actually store files.
 *
 * The editor has to have loaded before the panel's absence means anything. The
 * first version of this checked only the heading, so a dashboard that failed to
 * reach the backend reported "feature disabled" and skipped — a broken run
 * looking exactly like an unconfigured one, which is the failure mode this whole
 * helper exists to avoid.
 */
async function requireAttachments(page: Page) {
  await expect(page.getByRole("toolbar", { name: /formatting/i })).toBeVisible();

  const enabled = await page
    .getByRole("heading", { name: /^attachments$/i })
    .isVisible()
    .catch(() => false);

  test.skip(
    !enabled,
    "Set SUPABASE_SERVICE_ROLE_KEY in backend/.env and create the bucket to exercise attachments",
  );
}

test("a file can be attached, downloaded, and removed", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail());
  await newDocument(page);
  await requireAttachments(page);

  await expect(page.getByText(/nothing attached yet/i)).toBeVisible();

  await page.getByTestId("attachment-input").setInputFiles(textFile());

  await expect(page.getByText("notes.txt")).toBeVisible();

  // The bytes, not merely the row. Downloading opens a signed URL in a new tab;
  // fetching it through the request context proves Storage really holds what
  // was uploaded, which is the only part a database assertion cannot cover.
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: /^download$/i }).click(),
  ]);
  const signed = popup.url();
  await popup.close();

  expect(signed).toContain("token=");
  const fetched = await page.request.get(signed);
  expect(fetched.ok()).toBeTruthy();
  expect(await fetched.text()).toBe(FILE_TEXT);

  await page.getByRole("button", { name: /remove notes\.txt/i }).click();
  await expect(page.getByText("notes.txt")).toBeHidden();
  await expect(page.getByText(/nothing attached yet/i)).toBeVisible();
});

test("a disallowed file type is refused without uploading", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("reject"));
  await newDocument(page);
  await requireAttachments(page);

  const path = join(mkdtempSync(join(tmpdir(), "folium-e2e-")), "payload.exe");
  writeFileSync(path, "MZ");

  await page.getByTestId("attachment-input").setInputFiles(path);

  const panel = page.getByRole("region", { name: /attachments/i });

  // Scoped to the panel, not `page.getByRole("alert")`: Next.js renders its own
  // route announcer with role="alert", so an unscoped query matches two elements
  // and fails strict mode for a reason that has nothing to do with the upload.
  // The same shape as the two role="status" regions recorded in Phase 4-ii.
  await expect(panel.getByRole("alert")).toContainText(/not a file type/i);

  // "Nothing attached yet", not `getByText("payload.exe")` — the rejection
  // message names the file, so searching for the filename finds the very error
  // proving it was refused.
  await expect(panel.getByText(/nothing attached yet/i)).toBeVisible();
  await expect(panel.getByRole("listitem")).toHaveCount(0);
});

test("a viewer can download an attachment but not change it", async ({ browser }) => {
  test.slow();

  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();

  const guestEmail = uniqueEmail("viewer");
  await signUp(owner, uniqueEmail("owner"));
  await signUp(guest, guestEmail);

  await newDocument(owner);
  await requireAttachments(owner);
  await owner.getByTestId("attachment-input").setInputFiles(textFile("shared.txt"));
  await expect(owner.getByText("shared.txt")).toBeVisible();

  await owner.getByRole("button", { name: /^share$/i }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByRole("textbox", { name: /email/i }).fill(guestEmail);
  await dialog.getByRole("combobox", { name: /permission for the new/i }).selectOption("view");
  await dialog.getByRole("button", { name: /^share$/i }).click();
  await expect(dialog.getByText(guestEmail)).toBeVisible();

  await guest.goto("/dashboard");
  await guest.getByRole("link", { name: /untitled document/i }).click();
  await expect(guest.getByText(/read-only/i)).toBeVisible();

  // Reading is allowed; changing is not offered at all, and the backend 404s it
  // regardless of what the browser shows.
  await expect(guest.getByText("shared.txt")).toBeVisible();
  await expect(guest.getByRole("button", { name: /^download$/i })).toBeVisible();
  await expect(guest.getByRole("button", { name: /attach a file/i })).toBeHidden();
  await expect(guest.getByRole("button", { name: /remove shared\.txt/i })).toBeHidden();

  await ownerContext.close();
  await guestContext.close();
});
