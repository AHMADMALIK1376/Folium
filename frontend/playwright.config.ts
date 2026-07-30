import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Each test creates a real account in a shared database. Running them in
  // parallel makes failures hard to attribute, and the payoff is seconds.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // The auth journey signs in twice and visits four server-rendered pages, each
  // of which costs a FastAPI call to a hosted Supabase database. That lands just
  // either side of the 30s default, so the default makes it flaky rather than
  // failing honestly.
  timeout: 60_000,
  // Longer than the 5s default because the App Router commits a URL only once
  // the destination's payload has arrived, and /dashboard's payload means a
  // FastAPI round trip to a hosted database — behind a first-visit dev-mode
  // compile of the route. A post-sign-in landing assertion legitimately takes
  // longer than five seconds on a cold server.
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
