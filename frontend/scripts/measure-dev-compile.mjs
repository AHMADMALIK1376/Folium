/** How long the dev server takes to compile each route on its first visit.
 *
 * Not part of the suite — a measuring stick for one specific complaint:
 * "clicking New document takes 20 to 30 seconds". `next dev` compiles a route
 * the first time it is requested, and the editor route is the heaviest in the
 * app. This drives a real sign-up against a dev server and reports what Next
 * says it spent.
 *
 *   node scripts/measure-dev-compile.mjs [baseURL]
 *
 * Point it at a dev server you started yourself; it will not start one, because
 * the whole measurement is of a cold one.
 */

import { chromium } from "@playwright/test";

const baseURL = process.argv[2] ?? "http://localhost:3200";
const password = "e2e-password-123";
const email = `e2e-devperf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function step(label, work) {
  const started = Date.now();
  await work();
  const took = Date.now() - started;
  console.log(`  ${seconds(took).padStart(7)}  ${label}`);
  return took;
}

const browser = await chromium.launch();
const page = await browser.newPage();

console.log(`\nAgainst ${baseURL} — first visit to each route, so each includes its compile.\n`);

let total = 0;

total += await step("sign up (compiles /signup and /dashboard)", async () => {
  await page.goto(`${baseURL}/signup`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
});

total += await step("create a document", async () => {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByRole("link", { name: /untitled document/i }).waitFor({ timeout: 120_000 });
});

total += await step("open it (compiles /documents/[id] — the heavy one)", async () => {
  await page.getByRole("link", { name: /untitled document/i }).click();
  await page
    .getByRole("textbox", { name: /document body/i })
    .waitFor({ timeout: 180_000 });
});

total += await step("back to the dashboard (already compiled)", async () => {
  await page.getByRole("link", { name: /documents/i }).first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
});

total += await step("open the document again (already compiled)", async () => {
  await page.getByRole("link", { name: /untitled document/i }).click();
  await page
    .getByRole("textbox", { name: /document body/i })
    .waitFor({ timeout: 120_000 });
});

console.log(`\n  ${seconds(total).padStart(7)}  total\n`);

await browser.close();
