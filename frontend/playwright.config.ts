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
    // 3100, not 3000, so the suite never collides with a dev server — Folium's
    // or, as happened once, an entirely different project's.
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, not `next dev`, and deliberately.
    //
    // In dev, Next compiles each route on its first request, so the first sign-in
    // of a run waits seconds for /dashboard to build — long enough to look like a
    // failure, and long enough that the pre-hydration window on the auth forms is
    // wide open. Both cost real debugging time across 2C-ii and 2C-iii. A build
    // costs about twenty seconds once, and then every route is already compiled,
    // which is also what a user actually gets.
    command: "npm run build && cross-env PORT=3100 npm run start",
    url: "http://localhost:3100",
    // Never adopt a server this suite did not start.
    //
    // With `true` and port 3000, a run once spent six minutes testing an
    // unrelated app that happened to be listening — every assertion failing for
    // reasons that had nothing to do with Folium. A silent wrong-target run is
    // far worse than a refusal: if 3100 is occupied, Playwright now says so and
    // stops.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
