import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  openPalette,
  registerThroughTheForm,
  seedApplications,
  seedCampaign,
} from "./support";

// A campaign is a context rather than a filter: it spans three screens, lives in
// the URL so a link carries it, and the control for it sits in the header.

function table(page: Page) {
  return page.getByRole("table", { name: "Applications" });
}

function switcher(page: Page) {
  return page.getByLabel("Campaign");
}

test.describe("the campaign switcher", () => {
  test("is absent while there is nothing to switch", async ({ page }) => {
    // Every account registers with one campaign and only creating another is
    // entitled, so this is what most accounts see. A control over one option is
    // not a choice.
    await registerThroughTheForm(page, anEmail());

    await expect(switcher(page)).toHaveCount(0);
  });

  test("appears once there is a choice, and scopes the list", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    const second = await seedCampaign(email, "Contracting");

    await seedApplications(email, [
      { role: "In the default campaign" },
      { role: "In the second campaign", campaignId: second },
    ]);

    await page.goto("/applications");
    await expect(switcher(page)).toBeVisible();
    await expect(table(page)).toContainText("In the default campaign");

    await switcher(page).selectOption(second);

    // The URL carries the context, and the server re-rendered with it.
    await expect(page).toHaveURL(new RegExp(`campaignId=${second}`));
    await expect(table(page)).toContainText("In the second campaign");
    await expect(table(page)).not.toContainText("In the default campaign");
  });

  test("keeps the scope across a navigation and back", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    const second = await seedCampaign(email, "Contracting");
    await seedApplications(email, [{ role: "Only here", campaignId: second }]);

    await page.goto(`/applications?campaignId=${second}`);
    await expect(table(page)).toContainText("Only here");

    const nav = page.getByRole("navigation", { name: "Primary" });

    // Asserted on the href before anything is clicked. A stated href survives a
    // click that arrives before hydration, where a bare one loses the context to
    // an ordinary browser navigation - and reading an attribute cannot race that
    // navigation the way a URL assertion can.
    await expect(nav.getByRole("link", { name: "Board" })).toHaveAttribute(
      "href",
      `/board?campaignId=${second}`,
    );

    // Reminders is account-wide, so a campaign on that link would state
    // something the screen it leads to does not read.
    await expect(nav.getByRole("link", { name: "Reminders" })).toHaveAttribute(
      "href",
      "/reminders",
    );

    // Marking the current item stays a question about the path, so a scope in
    // the URL must not unmark the screen it applies to.
    await expect(nav.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // A context spans screens, so it has to survive moving between them - it is
    // in the URL for exactly this.
    await nav.getByRole("link", { name: "Board" }).click();

    // The destination is named, so this cannot be answered by the URL the test
    // started on. Without it the assertion passes before the navigation lands,
    // which is how it stayed green while nothing carried the scope at all.
    await expect(page).toHaveURL(new RegExp(`/board\\?.*campaignId=${second}`));

    await nav.getByRole("link", { name: "Applications" }).click();
    await expect(page).toHaveURL(new RegExp(`/applications\\?.*campaignId=${second}`));

    // The row is what proves the server re-rendered in scope, rather than a
    // string having survived in the address bar.
    await expect(table(page)).toContainText("Only here");
  });

  test("does not offer itself where a campaign means nothing", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedCampaign(email, "Contracting");

    await page.goto("/settings");

    // Reminders and Settings are account-wide. A scope control on them would
    // imply they narrow, and they do not.
    await expect(switcher(page)).toHaveCount(0);
  });
});

test.describe("the command palette", () => {
  test("opens on the keyboard and closes on Escape", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    await openPalette(page);
    const input = page.getByPlaceholder("Go to a screen or switch campaign");
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(input).toBeHidden();
  });

  test("opens from the button too, because a shortcut nobody sees is not an affordance", async ({
    page,
  }) => {
    await registerThroughTheForm(page, anEmail());

    // Matched on the hint rather than on "Commands" alone: the hint is rendered
    // from the client snapshot only, so a button carrying it is a button whose
    // click handler exists.
    await page.getByRole("button", { name: /⌘K|Ctrl K/ }).click();

    await expect(page.getByPlaceholder("Go to a screen or switch campaign")).toBeVisible();
  });

  test("filters to a destination and goes there", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    await openPalette(page);
    await page.getByPlaceholder("Go to a screen or switch campaign").fill("analy");

    // Arrow first: Base UI does not highlight anything on its own, so Enter has
    // nothing to act on until the list has been moved into. That is the keyboard
    // path the palette has to support, and driving it is what proves it does.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/analytics$/);
  });

  test("carries the campaign scope to where it sends you", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    const second = await seedCampaign(email, "Contracting");

    await page.goto(`/applications?campaignId=${second}`);
    await openPalette(page);
    await page.getByPlaceholder("Go to a screen or switch campaign").fill("analy");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // The palette pushes a route rather than following a link, so it loses the
    // context in its own way and has to keep it in its own way. The spec above
    // is the other half: on an account with no scope in the URL, the same
    // command has to land on a bare /analytics.
    await expect(page).toHaveURL(new RegExp(`/analytics\\?.*campaignId=${second}`));
  });

  test("switches campaign when there is one to switch to", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    const second = await seedCampaign(email, "Contracting");
    await seedApplications(email, [{ role: "Only here", campaignId: second }]);

    await page.goto("/applications");
    await openPalette(page);
    await page.getByPlaceholder("Go to a screen or switch campaign").fill("Contract");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`campaignId=${second}`));
    await expect(table(page)).toContainText("Only here");
  });

  test("offers no campaign commands when there is only one", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    await openPalette(page);
    await page.getByPlaceholder("Go to a screen or switch campaign").fill("Job search");

    // The account's own campaign is named "Job search" in the fake, so a match
    // here would mean the palette was offering to switch to where it already is.
    await expect(page.getByText("Nothing matches that.")).toBeVisible();
  });
});
