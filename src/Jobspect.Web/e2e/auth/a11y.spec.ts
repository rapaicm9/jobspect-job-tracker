import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { anEmail, registerThroughTheForm, seedApplications } from "./support";

/**
 * Repeated rather than imported from `enums.ts`, which opens with
 * `import 'server-only'` and throws outside a bundler. The canonical list is
 * already held to the contract by the enum agreement suite, so what is repeated
 * here is a fixture rather than a second source of truth.
 */
const STAGES = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Accepted",
  "Rejected",
  "Withdrawn",
  "Ghosted",
];

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

    test("the command palette has none while it is open", async ({ page }) => {
      await registerThroughTheForm(page, anEmail());

      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.getByPlaceholder("Go to a screen or switch campaign")).toBeVisible();

      // A dialog over a combobox is the most accessibility-sensitive thing on
      // this screen, and a sweep with it closed would never see any of it.
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

      expect(
        violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
        "axe found violations with the palette open",
      ).toEqual([]);
    });

    test("the shell has no accessibility violations on any destination", async ({ page }) => {
      const email = anEmail();
      await registerThroughTheForm(page, email);

      // One row per stage, so the sweep judges every chip treatment rather than
      // an empty table. The eight surface/foreground pairs exist because no
      // single value cleared both contrast floors, and this is what checks that
      // they still do - in both themes, which is where it went wrong before.
      await seedApplications(
        email,
        STAGES.map((stage, index) => ({
          stage,
          role: `Engineer ${String(index)}`,
          companyName: "Acme",
          source: "LinkedIn",
          compensation: { amount: 65000, currency: "GBP" },
          location: "London",
          workMode: "Hybrid",
          applicationDeadline: "2026-09-01",
        })),
      );

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
