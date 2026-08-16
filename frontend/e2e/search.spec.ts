import { expect, test, type Page } from "@playwright/test";

/** Finding a document by what is in it. */

function uniqueEmail(role = "search") {
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

async function writeDocument(page: Page, title: string, body: string) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).first().click();
  await expect(page).toHaveURL(/\/documents\//);

  const titleBox = page.getByRole("textbox", { name: /document title/i });
  await titleBox.fill(title);

  await page.getByRole("textbox", { name: /document body/i }).click();
  await page.keyboard.type(body);

  await expect(page.getByRole("status", { name: /save status/i })).toHaveText(/^saved$/i);
}

test("a document is found by a word in its body", async ({ page }) => {
  test.slow();

  const marker = `zebracrossing${Date.now().toString(36)}`;
  await signUp(page, uniqueEmail());
  await writeDocument(page, "Notes from Tuesday", `Something about ${marker} in here.`);

  await page.goto("/dashboard");
  const search = page.getByRole("search");
  await page.getByRole("searchbox").fill(marker);

  // Scoped to the search region: the same document is also in the list below,
  // so an unscoped query matches twice and fails strict mode.
  const result = search.getByRole("link", { name: /notes from tuesday/i });
  await expect(result).toBeVisible();
  // The snippet is what makes a result useful — a title alone does not say why
  // it matched.
  await expect(search.getByText(new RegExp(marker))).toBeVisible();

  await result.click();
  await expect(page).toHaveURL(/\/documents\//);
});

test("nothing matching says so rather than showing everything", async ({ page }) => {
  test.slow();

  await signUp(page, uniqueEmail("empty"));
  await writeDocument(page, "A document", "with ordinary words");

  await page.goto("/dashboard");
  await page.getByRole("searchbox").fill("qqzzxx-no-such-word");

  await expect(page.getByText(/nothing matches/i)).toBeVisible();
});

test("a punctuation-only query does not break the page", async ({ page }) => {
  test.slow();

  // Raw input reaches a query parser; to_tsquery would raise a syntax error on
  // most of these and turn a half-typed search into a 500.
  await signUp(page, uniqueEmail("weird"));
  await writeDocument(page, "A document", "with ordinary words");

  await page.goto("/dashboard");

  // Scoped, because Next.js renders its own role="alert" route announcer — the
  // third time that has caught a test in this project.
  const search = page.getByRole("search");

  for (const query of ['" unclosed', "&&&", "a & b", "!!!"]) {
    await page.getByRole("searchbox").fill(query);
    await expect(search.getByRole("alert")).toHaveCount(0);
  }
});
