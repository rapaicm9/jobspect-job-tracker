import { defineConfig, devices } from "@playwright/test";

import { LIGHT_PROJECT } from "./e2e/theme";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The authenticated suite lives under e2e/auth and needs Docker, a fake API
  // and a Redis that only playwright.auth.config.ts starts. Without this the
  // recursive testDir would collect those specs here too, and they would fail
  // against a server with none of it running.
  testIgnore: ["auth/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Dark is what the product renders with nothing set, so it is the plain
    // project. Light is the opt-in, and this second pass is what keeps its half
    // of the palette from rotting while the settings control that reaches it is
    // still unbuilt. `colorScheme` no longer selects either one — the tokens
    // stopped consulting prefers-color-scheme — so e2e/theme.ts sets the class.
    { name: "chromium-dark", use: { ...devices["Desktop Chrome"] } },
    { name: LIGHT_PROJECT, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // A production build, never the dev server: dev writes into the project
    // directory and a test run must not touch the working tree. It also means
    // the suite measures what actually ships.
    command: "pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Covers a fully cold production build, which is what a CI run gets the
    // first time - and any time the .next/cache key misses. A warm build serves
    // in about 30s, so this ceiling only ever costs time on a real failure.
    timeout: 300_000,
    env: {
      PORT: String(PORT),
      // The instrumentation hook registers the access-token provider at startup,
      // which pulls in the API client, which refuses to load without this. A
      // deployment always has one; the suite has to supply it too. Unreachable
      // on purpose - nothing here calls the API, and a value that resolves would
      // hide a test that started to.
      JOBSPECT_API_BASE_URL: "http://api.test",
    },
  },
});
