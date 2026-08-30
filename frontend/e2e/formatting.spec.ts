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

/** Select everything in the document body, and wait until the app agrees.
 *
 * The wait is the whole point. Clicking a toolbar control before the selection
 * has registered applies the mark to a collapsed cursor, which sets it for the
 * *next character typed* and changes nothing on screen -- so the test reads the
 * old value and reports a formatting bug that is not there. Two of these failed
 * exactly that way, in a full run but never alone.
 *
 * The statistics line is the honest signal: it says how many words are
 * selected, so it only reads "selected" once there is a selection to count.
 *
 * Call this **once**, before the first toolbar action. Calling it again after
 * using one of the `<select>` controls does not reliably re-select -- it cost
 * two more failures to establish that -- and it is not needed: applying a mark
 * keeps the selection you had, which is what makes "set a size, then nudge it"
 * work at all. Asserting that the selection survived is the better test. */
async function selectAll(page: Page) {
  await body(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByRole("status", { name: /document statistics/i })).toContainText(
    /words selected/i,
  );
}

test("a colour picked from the palette lands on the text and survives a reload", async ({
  page,
}) => {
  test.slow();

  await signUp(page, uniqueEmail("fmt-colour"));
  await openNewDocument(page);
  await write(page, "Coloured words.");
  await selectAll(page);

  await page.getByRole("button", { name: "Text colour" }).click();
  await page.getByRole("button", { name: "Blue" }).click();

  // The mark is on the text, not merely recorded in the toolbar.
  const span = body(page).locator("span[style*='color']").first();
  await expect(span).toHaveText(/coloured words/i);

  // Reloading is the assertion that matters: it proves the colour reached
  // Postgres rather than living in the browser's copy of the document.
  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
  await page.reload();
  await expect(body(page).locator("span[style*='color']").first()).toHaveText(
    /coloured words/i,
  );
});

test("highlights come in colours, not one fixed yellow", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("fmt-highlight"));
  await openNewDocument(page);
  await write(page, "Marked up.");
  await selectAll(page);

  await page.getByRole("button", { name: "Highlight" }).click();
  await page.getByRole("button", { name: "Pink" }).click();

  const mark = body(page).locator("mark").first();
  await expect(mark).toBeVisible();
  // The colour rides on the mark as an inline style, which is what beats the
  // stylesheet's fallback yellow.
  await expect(mark).toHaveAttribute("style", /background-color/i);
});

test("font size changes the text, and grow steps up the ladder", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("fmt-size"));
  await openNewDocument(page);
  await write(page, "Sized text.");
  await selectAll(page);

  await page.getByRole("combobox", { name: "Font size" }).selectOption("24");
  await expect(body(page).locator("span[style*='font-size']").first()).toHaveCSS(
    "font-size",
    "32px", // 24pt
  );

  // No second selection: changing the size keeps the one you had, which is what
  // Word does and what makes "set 24, then nudge" possible at all. Asserting it
  // here is worth more than re-selecting would be -- a re-select would hide it
  // if the selection were being dropped.
  await expect(page.getByRole("status", { name: /document statistics/i })).toContainText(
    /words selected/i,
  );

  await page.getByRole("button", { name: "Grow font" }).click();
  // 24 -> 28pt, the next rung rather than a fixed increment.
  await expect(body(page).locator("span[style*='font-size']").first()).toHaveCSS(
    "font-size",
    /37\.3|37px/,
  );
});

test("justify is offered and applies", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("fmt-justify"));
  await openNewDocument(page);
  await write(page, "A line long enough that justifying it means something at all.");

  await page.getByRole("button", { name: "Justify" }).click();

  await expect(body(page).locator("p").first()).toHaveCSS("text-align", "justify");
  await expect(page.getByRole("button", { name: "Justify" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the export warning names what the new formatting will cost", async ({ page }) => {
  // The rule this project keeps: formatting may be lost on export, never
  // silently. Size and highlight colour are new kinds of loss, so they have to
  // reach the sentence the dialog shows before writing a file.
  test.slow();

  await signUp(page, uniqueEmail("fmt-lossy"));
  await openNewDocument(page);
  await write(page, "Formatted heavily.");
  await selectAll(page);

  await page.getByRole("combobox", { name: "Font size" }).selectOption("24");
  // Not re-selected: the size change keeps the selection, and re-selecting here
  // is the thing that actually breaks -- see the note on selectAll.
  await page.getByRole("button", { name: "Highlight" }).click();
  await page.getByRole("button", { name: "Pink" }).click();

  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);

  await page.getByRole("button", { name: /export/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/highlight colour/i)).toBeVisible();
  await expect(dialog.getByText(/text size/i)).toBeVisible();
});
