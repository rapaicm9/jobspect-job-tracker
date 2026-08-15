import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  failCalls,
  idempotencyKeys,
  registerThroughTheForm,
  seedActivity,
  seedApplications,
} from "./support";

// The pipeline itself. The menu offers what the client believes is legal; the
// server judges every move, and the two disagreeing is a case with its own spec.

const APPLICATION_ID = "88888888-8888-4888-8888-888888888888";

function feed(page: Page) {
  return page.getByRole("list", { name: "Activity" });
}

function header(page: Page) {
  return page.getByRole("heading", { level: 1 }).locator("..");
}

/**
 * The screen's own alert.
 *
 * Not `getByRole("alert")`: Next renders a permanent, empty route announcer with
 * that role on every page, so the bare query is ambiguous everywhere in the app.
 * The design system's own slot attribute is the unambiguous hook.
 */
function refusal(page: Page) {
  return page.locator('[data-slot="alert"]');
}

async function openAt(page: Page, stage: string): Promise<string> {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, [
    { id: APPLICATION_ID, role: "Frontend Engineer", companyName: "Acme", stage },
  ]);
  await seedActivity(email, APPLICATION_ID, [
    { kind: "Created", toStage: "Applied", occurredAt: "2026-08-01T09:00:00Z" },
  ]);
  await page.goto(`/applications/${APPLICATION_ID}`);

  return email;
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Move" }).click();
  return page.getByRole("menu");
}

test.describe("the transition menu", () => {
  test("offers only the moves the pipeline allows from here", async ({ page }) => {
    await openAt(page, "Applied");

    const menu = await openMenu(page);

    // Forward, with skips.
    await expect(menu.getByRole("menuitem", { name: "Screening" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Offer" })).toBeVisible();
    // Closing, from anywhere active.
    await expect(menu.getByRole("menuitem", { name: "Rejected" })).toBeVisible();

    // Never where it already is, and never an outcome that has to be earned.
    await expect(menu.getByRole("menuitem", { name: "Applied" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Accepted" })).toHaveCount(0);
  });

  test("offers Accepted once there is an offer to accept", async ({ page }) => {
    await openAt(page, "Offer");

    const menu = await openMenu(page);

    await expect(menu.getByRole("menuitem", { name: "Accepted" })).toBeVisible();
    // Nothing is further forward than Offer.
    await expect(menu.getByRole("menuitem", { name: "Screening" })).toHaveCount(0);
  });

  test("lets a closed application be reopened or reclassified, but not accepted", async ({
    page,
  }) => {
    await openAt(page, "Rejected");

    const menu = await openMenu(page);

    await expect(menu.getByRole("menuitem", { name: "Applied" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Ghosted" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Accepted" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Rejected" })).toHaveCount(0);
  });

  test("separates closing out from moving along", async ({ page }) => {
    await openAt(page, "Screening");

    const menu = await openMenu(page);

    // Closing is a different kind of move, and the menu says so rather than
    // listing eight destinations as one.
    await expect(menu.getByText("Move to")).toBeVisible();
    await expect(menu.getByText("Close out")).toBeVisible();
  });
});

test.describe("moving an application", () => {
  test("updates the stage and records it on the timeline without a reload", async ({ page }) => {
    await openAt(page, "Applied");

    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: "Interview" }).click();

    // The header is server-rendered and the timeline is a client cache; a move
    // has to move both or the screen contradicts itself.
    //
    // Longer than the default five seconds, because this waits on a Server
    // Action, a call to the API, a server re-render of the whole page and a
    // refetch of the history. Under load this is where the budget runs out
    // first, and a genuine break still fails - only later.
    await expect(header(page).getByText("Interview")).toBeVisible({ timeout: 15_000 });
    await expect(feed(page)).toContainText("Moved from", { timeout: 15_000 });
    await expect(feed(page)).toContainText("Applied");
  });

  test("reads a closure as a closure", async ({ page }) => {
    await openAt(page, "Screening");

    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: "Withdrawn" }).click();

    await expect(feed(page)).toContainText("Closed as", { timeout: 15_000 });
    await expect(feed(page)).toContainText("Withdrawn");
  });

  test("shows the server's refusal, naming both stages, and does not move", async ({ page }) => {
    // The menu will not offer an illegal move, so the disagreement has to be
    // seeded: the client's model is a convenience and the server's is the truth.
    const email = await openAt(page, "Applied");
    await failCalls(email, ["transition-illegal"]);

    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: "Screening" }).click();

    await expect(refusal(page)).toContainText(
      "An application cannot move from Applied to Screening.",
    );
    await expect(header(page).getByText("Applied")).toBeVisible();
  });

  test("waits out an in-flight key and re-issues the same one", async ({ page }) => {
    const email = await openAt(page, "Applied");
    await failCalls(email, ["transition-in-flight"]);

    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: "Screening" }).click();

    // The retry is the action's, not the user's: one gesture, two requests, one
    // key - a new key would be a second move.
    await expect(header(page).getByText("Screening")).toBeVisible({ timeout: 15_000 });

    const keys = await idempotencyKeys(email);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  test("reports an outage as retryable rather than as a refusal", async ({ page }) => {
    const email = await openAt(page, "Applied");
    await failCalls(email, ["transition-unavailable"]);

    const menu = await openMenu(page);
    await menu.getByRole("menuitem", { name: "Screening" }).click();

    // Nothing about the request was wrong, so it must not read like a validation
    // failure.
    await expect(refusal(page)).toContainText("Try again in a moment.");
    await expect(header(page).getByText("Applied")).toBeVisible();
  });
});
