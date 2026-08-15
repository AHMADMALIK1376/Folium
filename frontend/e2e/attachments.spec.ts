import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

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

function uniqueEmail(role = "attach") {
  return `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-password-123";
const FILE_TEXT = "Attachment contents that must survive the round trip.\n";

function textFile(name = "notes.txt"): string {
  const path = join(mkdtempSync(join(tmpdir(), "folium-e2e-")), name);
  writeFileSync(path, FILE_TEXT, "utf-8");
  return path;
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function newDocument(page: Page) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).click();
  await expect(page).toHaveURL(/\/documents\//);
}

/** Skip unless this deployment can actually store files. */
async function requireAttachments(page: Page) {
  const heading = page.getByRole("heading", { name: /^attachments$/i });
  const enabled = await heading.isVisible().catch(() => false);
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

  await expect(page.getByRole("alert")).toContainText(/not a file type/i);
  await expect(page.getByText("payload.exe")).toBeHidden();
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
