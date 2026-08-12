import { expect, test, type Page } from "@playwright/test";

import { anEmail, registerThroughTheForm, seedApplications } from "./support";

// The densest screen in the product, against the widened read model: every
// column here comes from one response, so nothing on this page fetches per row.

const ROW = {
  role: "Frontend Engineer",
  companyName: "Acme",
  stage: "Interview",
  appliedDate: "2026-08-01",
  applicationDeadline: "2026-08-20",
  source: "LinkedIn",
  compensation: { amount: 65000, currency: "GBP" },
  location: "London",
  workMode: "Hybrid",
};

function table(page: Page) {
  return page.getByRole("table", { name: "Applications" });
}

async function signInWith(page: Page, rows: Record<string, unknown>[]) {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, rows);
  await page.goto("/applications");
}

test.describe("the applications list", () => {
  test("shows every default column from the one response", async ({ page }) => {
    await signInWith(page, [ROW]);

    const row = table(page).getByRole("row").nth(1);

    await expect(row).toContainText("Frontend Engineer");
    await expect(row).toContainText("Acme");
    await expect(row).toContainText("Interview");
    await expect(row).toContainText("LinkedIn");
    // Formatted, not echoed: the API sends 2026-08-01 and the reader gets a day
    // that does not shift by a zone.
    await expect(row).toContainText("1 Aug 2026");
    await expect(row).toContainText("20 Aug 2026");
    await expect(row).toContainText("£65,000");
  });

  test("keeps the machine-readable date beside the rendered one", async ({ page }) => {
    await signInWith(page, [ROW]);

    await expect(table(page).locator("time").first()).toHaveAttribute("datetime", "2026-08-01");
  });

  test("hides work mode and location until they are asked for", async ({ page }) => {
    await signInWith(page, [ROW]);

    await expect(table(page).getByRole("columnheader", { name: "Location" })).toBeHidden();

    await page.getByRole("button", { name: "Location" }).click();

    await expect(table(page).getByRole("columnheader", { name: "Location" })).toBeVisible();
    await expect(table(page).getByRole("row").nth(1)).toContainText("London");
  });

  test("remembers the columns across a reload", async ({ page }) => {
    await signInWith(page, [ROW]);
    await page.getByRole("button", { name: "Work mode" }).click();
    await expect(table(page).getByRole("columnheader", { name: "Work mode" })).toBeVisible();

    await page.reload();

    // The cookie, not the URL: a preference travels with the browser rather than
    // with a link somebody shares.
    await expect(table(page).getByRole("columnheader", { name: "Work mode" })).toBeVisible();
  });

  test("changes the row height when density changes", async ({ page }) => {
    await signInWith(page, [ROW]);

    const row = table(page).getByRole("row").nth(1);
    const comfortable = (await row.boundingBox())?.height ?? 0;

    const compactButton = page.getByRole("button", { name: "Compact" });
    await compactButton.click();

    // Wait for the state to have actually changed before measuring. `click`
    // resolves when the click is dispatched, not when the Server Action it
    // submits has come back and re-rendered - measuring straight after it reads
    // the old row and the failure looks like the density doing nothing.
    await expect(compactButton).toHaveAttribute("aria-pressed", "true");

    const compact = (await row.boundingBox())?.height ?? 0;
    expect(compact).toBeLessThan(comfortable);
  });

  test("says the list is empty rather than broken", async ({ page }) => {
    await signInWith(page, []);

    await expect(page.getByText("No applications yet")).toBeVisible();
    // An account with nothing recorded has not failed at anything, so no error
    // wording and no controls for a table that is not there.
    await expect(table(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Compact" })).toBeHidden();
  });

  test("shows no count of anything, anywhere", async ({ page }) => {
    await signInWith(page, [ROW, { ...ROW, role: "Backend Engineer" }]);

    // The API returns no total by design, so a number on this screen could only
    // be a count of what happens to be loaded - which reads as a total and is
    // not one.
    await expect(page.getByText(/\b2 applications?\b/i)).toHaveCount(0);
    await expect(page.getByText(/showing/i)).toHaveCount(0);
  });
});

test.describe("below the table breakpoint", () => {
  test.use({ viewport: { width: 480, height: 900 } });

  test("swaps the table for cards, and only one of them exists", async ({ page }) => {
    await signInWith(page, [ROW]);

    // The assertion is on the accessibility tree rather than on classes: both
    // markups are in the DOM and `display: none` is what keeps the hidden one
    // from being announced twice. A stray visibility or opacity would pass a
    // class check and fail a screen reader.
    await expect(table(page)).toBeHidden();

    // Scoped to the list by name: the shell's nav is a list of five items too,
    // and an unscoped listitem query counts those as well.
    const cards = page.getByRole("list", { name: "Applications" });
    await expect(cards).toBeVisible();
    await expect(cards.getByRole("listitem")).toContainText("Frontend Engineer");
  });
});
