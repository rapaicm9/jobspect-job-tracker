import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Every route that renders HTML and can be reached without an account. The
// health endpoints serve text/plain and have nothing for axe to analyse, and
// /applications redirects to /login until there is a way to sign in from a test.
// Add to this list as routes land; the point of wiring it now is that no route
// ever arrives unchecked.
const ROUTES = ["/", "/login", "/register"];

// target-size (2.5.8) is off unless the WCAG 2.2 ruleset is asked for by name.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const route of ROUTES) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route);

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

    expect(
      violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
      "axe found violations",
    ).toEqual([]);
  });
}
