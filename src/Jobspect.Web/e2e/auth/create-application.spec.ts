import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  failCalls,
  idempotencyKeys,
  openPalette,
  registerThroughTheForm,
  seedApplications,
  seedCampaign,
} from "./support";

// The write where applying the same request twice is two rows rather than one,
// which is what the idempotency key exists to prevent.

const ROLE = "Frontend Engineer";

async function openTheForm(page: Page): Promise<string> {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await page.goto("/applications/new");
  await expect(page.getByLabel("Role")).toBeVisible();

  return email;
}

function submit(page: Page) {
  return page.getByRole("button", { name: "Add application", exact: true }).last().click();
}

test.describe("adding an application", () => {
  test("is offered from the list's empty state, which is otherwise a dead end", async ({
    page,
  }) => {
    await registerThroughTheForm(page, anEmail());

    await expect(page.getByText("No applications yet")).toBeVisible();

    // Exactly one, and the count is the assertion: the empty state carries its
    // own call to action, so a header button beside it would be a second link
    // reading the same words - heard twice by anybody navigating by link, and
    // the reason a spec here once needed `.last()` to say which it meant.
    const add = page.getByRole("link", { name: "Add application" });
    await expect(add).toHaveCount(1);

    await add.click();
    await expect(page).toHaveURL(/\/applications\/new$/);
  });

  test("is offered from the board, which has no data of its own yet", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());
    await page.goto("/board");

    await page.getByRole("link", { name: "Add application" }).click();
    await expect(page).toHaveURL(/\/applications\/new$/);
  });

  test("is reachable from the palette on a screen that is not the list", async ({ page }) => {
    // The whole reason creating lives at a URL: the palette fires from wherever
    // the user is, and a dialog on the list could not answer it.
    await registerThroughTheForm(page, anEmail());
    await page.goto("/analytics");

    await openPalette(page);
    await page.getByRole("option", { name: "Add application" }).click();

    await expect(page).toHaveURL(/\/applications\/new$/);
  });

  test("records one and lands back on the list with it visible", async ({ page }) => {
    await openTheForm(page);

    await page.getByLabel("Role").fill(ROLE);
    await page.getByLabel("Company").fill("Acme");
    await submit(page);

    await expect(page).toHaveURL(/\/applications(\?|$)/);
    await expect(page.getByRole("link", { name: ROLE })).toBeVisible();
  });

  test("needs only a role", async ({ page }) => {
    // Everything else is optional and the applied date is defaulted, so the
    // least anybody can type is one field.
    await openTheForm(page);

    await page.getByLabel("Role").fill("Platform Engineer");
    await submit(page);

    await expect(page.getByRole("link", { name: "Platform Engineer" })).toBeVisible();
  });

  test("shows the API's refusal against the field it names", async ({ page }) => {
    await openTheForm(page);

    // Guarded on this side too, so this never reaches the API - which is the
    // point: the round trip buys nothing when the rule is "answer the question".
    await submit(page);

    await expect(page.getByText("A role is required.")).toBeVisible();
    await expect(page).toHaveURL(/\/applications\/new$/);
  });

  test("opens the application in the campaign being looked at", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    const second = await seedCampaign(email, "Contract search");

    await page.goto(`/applications/new?campaignId=${second}`);
    await page.getByLabel("Role").fill(ROLE);
    await submit(page);

    // Back to the list it came from, still scoped - and the row is in it, which
    // is only true if the create carried the campaign.
    await expect(page).toHaveURL(new RegExp(`campaignId=${second}`));
    await expect(page.getByRole("link", { name: ROLE })).toBeVisible();
  });
});

test.describe("the idempotency key", () => {
  test("is reused when the same application is submitted again", async ({ page }) => {
    const email = await openTheForm(page);
    await failCalls(email, ["create-application"]);

    await page.getByLabel("Role").fill(ROLE);
    await submit(page);
    await expect(page.getByText(/has not been saved/)).toBeVisible();

    // The same application, so the same intent. Re-issuing the key is what makes
    // one application one application however many attempts it took.
    await submit(page);
    await expect(page.getByRole("link", { name: ROLE })).toBeVisible();

    const keys = await idempotencyKeys(email);

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  test("is replaced once the application has been edited", async ({ page }) => {
    // A key belongs to its payload: the API fingerprints the body, so the same
    // key over a changed application is refused as a reused key rather than
    // replayed - which would be the wrong answer, since it is a different thing
    // being created.
    const email = await openTheForm(page);
    await failCalls(email, ["create-application"]);

    await page.getByLabel("Role").fill(ROLE);
    await submit(page);
    await expect(page.getByText(/has not been saved/)).toBeVisible();

    await page.getByLabel("Role").fill("Staff Engineer");
    await submit(page);
    await expect(page.getByRole("link", { name: "Staff Engineer" })).toBeVisible();

    const keys = await idempotencyKeys(email);

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });
});

test.describe("the source box", () => {
  test("offers what this account has already used", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedApplications(email, [
      { id: "99999999-9999-4999-8999-999999999999", source: "LinkedIn" },
    ]);

    await page.goto("/applications/new");

    const listId = await page.getByLabel("Source").getAttribute("list");
    expect(listId, "the source box is wired to a datalist").not.toBeNull();

    await expect(page.locator(`datalist[id="${listId!}"] option`)).toHaveCount(1);
  });
});

test.describe("accessibility", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`the create form has no violations in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openTheForm(page);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
