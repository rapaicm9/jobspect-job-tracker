import { expect, test, type Page } from "@playwright/test";

import { anEmail, registerThroughTheForm } from "./support";

// The frame every signed-in screen renders inside. Reachable only with a
// session, which is what the stack beside this file exists to provide.

const DESTINATIONS = [
  { label: "Board", path: "/board", heading: "Board" },
  { label: "Applications", path: "/applications", heading: "Applications" },
  { label: "Analytics", path: "/analytics", heading: "Analytics" },
  { label: "Reminders", path: "/reminders", heading: "Reminders" },
  { label: "Settings", path: "/settings", heading: "Settings" },
];

function nav(page: Page) {
  return page.getByRole("navigation", { name: "Primary" });
}

test.describe("the shell", () => {
  test("offers every destination the product has", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    await expect(nav(page).getByRole("link")).toHaveText(DESTINATIONS.map((d) => d.label));
  });

  test("marks the destination the user is on", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    // Stated, not merely coloured: aria-current is what a screen reader reads,
    // and a background tint is available to nobody who cannot see it.
    await expect(nav(page).getByRole("link", { name: "Applications" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav(page).getByRole("link", { name: "Board" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("navigates to each one and marks it in turn", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    for (const { label, path, heading } of DESTINATIONS) {
      await nav(page).getByRole("link", { name: label }).click();

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(nav(page).getByRole("link", { name: label })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("keeps sign-out reachable from every screen, not just the first", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    await nav(page).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
  });

  test("puts a working skip link first in the tab order", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();

    await page.keyboard.press("Enter");

    // Focus moving is the whole point. A fragment link to an element that cannot
    // hold focus scrolls the page and leaves the keyboard where it was, which
    // looks like it worked and is not.
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("navigates client-side without a policy violation", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/content security policy/i.test(message.text())) violations.push(message.text());
    });

    await registerThroughTheForm(page, anEmail());

    // The assertion that earns this test. Prefetches now skip the proxy, so the
    // payload behind each of these was rendered without a policy on its request
    // - and the scripts a client-side transition pulls in still have to be ones
    // the browser will run.
    for (const { label } of DESTINATIONS) {
      await nav(page).getByRole("link", { name: label }).click();
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    }

    expect(violations).toEqual([]);
  });
});
