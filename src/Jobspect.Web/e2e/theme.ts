import { expect, type Page, test as base } from "@playwright/test";

import { type Theme, THEME_COOKIE } from "@/lib/theme";

export const LIGHT_PROJECT = "chromium-light";

/**
 * Puts a browser context into one of the two themes.
 *
 * Since dark stopped being system-driven, `colorScheme` selects neither: the
 * tokens do not consult prefers-color-scheme any more, so a suite that varied
 * that option would render the same page twice.
 *
 * Seeds the cookie the root layout reads, which is the mechanism the settings
 * screen will drive rather than a stand-in for it. An earlier version added the
 * class from an init script and had to be abandoned: it lands after first paint,
 * so the page rendered dark and then animated every `transition-colors` toward
 * the light palette — the nav links spent about 150ms below 4.5:1 and axe caught
 * them there, at a different intermediate colour each run.
 *
 * Must be called before the first navigation.
 */
export async function applyTheme(page: Page, theme: Theme): Promise<void> {
  // Keyed by host rather than by url, because cookies ignore the port and the
  // two configs bind different ones.
  await page
    .context()
    .addCookies([{ name: THEME_COOKIE, value: theme, domain: "127.0.0.1", path: "/" }]);
}

/**
 * That the page really is in the theme it was asked for.
 *
 * Worth asserting somewhere in every suite that varies the theme: the contrast
 * floors hold in both by construction, so a lane that had quietly stopped
 * applying its class would go on passing while testing dark twice.
 */
export async function expectTheme(page: Page, theme: Theme): Promise<void> {
  const dark = await page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return r + g + b < 382;
  });

  expect(dark, `the page painted the wrong ground for the ${theme} theme`).toBe(theme === "dark");
}

/** The ordinary suite varies the theme by project rather than by describe. */
export const test = base.extend({
  // Playwright's second argument is `use` by convention, and the React hooks
  // lint rule reads a bare `use(...)` call as React's own. Renamed rather than
  // suppressed - it is positional.
  page: async ({ page }, runTest, testInfo) => {
    await applyTheme(page, testInfo.project.name === LIGHT_PROJECT ? "light" : "dark");

    await runTest(page);
  },
});

export { expect } from "@playwright/test";
