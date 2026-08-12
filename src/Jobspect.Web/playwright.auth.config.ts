import { defineConfig, devices } from "@playwright/test";

import {
  FAKE_API_ORIGIN,
  FAKE_API_PORT,
  REDIS_CONTAINER,
  REDIS_PORT,
  REDIS_URL,
  WEB_ORIGIN,
  WEB_PORT,
} from "./e2e/stack/ports";

// The authenticated suite, and the only one that needs Docker.
//
// A second config rather than a project inside the first, because `webServer` is
// global to a run: Playwright starts every entry regardless of which projects
// are selected, so a project switch could not keep the ordinary lane free of
// containers. Splitting the file is what keeps `pnpm test:e2e` runnable with the
// daemon stopped.
//
// There is deliberately no globalSetup. Playwright starts web servers before it
// runs one, so a setup hook could not hand the already-spawned Next server a
// connection string - the port would have to be pinned by hand anyway. Running
// Redis as a third entry removes the ordering question instead of working around
// it: all three report ready before the first spec, and all three come down at
// the end.

export default defineConfig({
  testDir: "./e2e/auth",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: WEB_ORIGIN,
    trace: "on-first-retry",
  },
  // One project, not the light/dark pair the other config runs: nothing here
  // asserts a colour. What this suite exercises is the session, and running it
  // twice would only double the sign-ins.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/stack/redis.mjs",
      env: {
        REDIS_CONTAINER,
        REDIS_PORT: String(REDIS_PORT),
        // The image the backend's own integration fixture uses, so a machine
        // that has run the .NET suite has already pulled it.
        REDIS_IMAGE: "redis:8.2",
      },
      // Redis speaks RESP, so there is no URL to poll. Its own readiness line is
      // the signal, which is what this option exists for.
      wait: { stdout: /Ready to accept connections/ },
      // Generous because a machine without the image pulls it inside this window.
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: "node e2e/stack/fake-api.mts",
      url: `${FAKE_API_ORIGIN}/__health`,
      env: { PORT: String(FAKE_API_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      // The same production build the other suite runs, for the same reason: the
      // development server writes into the working tree, and the CSP this app
      // relies on is only the strict one in a production build.
      command: "pnpm build && pnpm start",
      // Not /health/ready, which pings Redis - the three entries come up in no
      // particular order, so readiness here must not depend on another of them.
      url: WEB_ORIGIN,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        PORT: String(WEB_PORT),
        JOBSPECT_API_BASE_URL: FAKE_API_ORIGIN,
        ConnectionStrings__cache: REDIS_URL,
      },
    },
  ],
});
