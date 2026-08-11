import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { anEmail, registerThroughTheForm } from "./support";

// The signed-in half of the product, which e2e/a11y.spec.ts cannot reach: those
// routes redirect to /login without a session, so until this stack existed the
// gate only ever saw the marketing pages.

const ROUTES = ["/board", "/applications", "/analytics", "/reminders", "/settings"];

// target-size (2.5.8) is off unless the WCAG 2.2 ruleset is asked for by name.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Both themes, but only here. The ordinary suite runs its whole file twice
// because every spec in it is about colour; the session specs beside this one
// would only sign in twice to prove the same thing, so the theme is scoped to
// the sweep that reads it rather than to a second project.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the shell has no accessibility violations on any destination", async ({ page }) => {
      await registerThroughTheForm(page, anEmail());

      // One session across the five routes: signing in per route would be five
      // registrations to sweep one header.
      for (const route of ROUTES) {
        await page.goto(route);

        const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

        expect(
          violations.map((v) => `${route} ${v.id} (${v.nodes.length}): ${v.help}`),
          `axe found violations on ${route}`,
        ).toEqual([]);
      }
    });
  });
}
