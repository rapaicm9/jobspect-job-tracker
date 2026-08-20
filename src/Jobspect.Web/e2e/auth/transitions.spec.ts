import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  failCalls,
  idempotencyKeys,
  openTransitionMenu,
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

test.describe("the transition menu", () => {
  test("offers only the moves the pipeline allows from here", async ({ page }) => {
    await openAt(page, "Applied");

    const menu = await openTransitionMenu(page);

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

    const menu = await openTransitionMenu(page);

    await expect(menu.getByRole("menuitem", { name: "Accepted" })).toBeVisible();

    // Nothing is further forward than Offer, but everything behind it is still
    // offered: an application moved on by mistake is put back from here.
    await expect(menu.getByRole("menuitem", { name: "Screening" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Offer" })).toHaveCount(0);
  });

  test("lets a closed application be reopened or reclassified, but not accepted", async ({
    page,
  }) => {
    await openAt(page, "Rejected");

    const menu = await openTransitionMenu(page);

    await expect(menu.getByRole("menuitem", { name: "Applied" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Ghosted" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Accepted" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Rejected" })).toHaveCount(0);
  });

  test("separates closing out from moving along", async ({ page }) => {
    await openAt(page, "Screening");

    const menu = await openTransitionMenu(page);

    // Closing is a different kind of move, and the menu says so rather than
    // listing eight destinations as one.
    await expect(menu.getByText("Move to")).toBeVisible();
    await expect(menu.getByText("Close out")).toBeVisible();
  });
});

test.describe("moving an application", () => {
  test("updates the stage and records it on the timeline without a reload", async ({ page }) => {
    await openAt(page, "Applied");

    const menu = await openTransitionMenu(page);
    await menu.getByRole("menuitem", { name: "Interview" }).click();

    // The header is server-rendered and the timeline is a client cache; a move
    // has to move both or the screen contradicts itself.
    //
    // On the default budget. The inflated one covered a Server Action, a call to
    // the API, a whole-page re-render and a refetch of the history, in that
    // order; the move is one request now and there is nothing left for the extra
    // ten seconds to absorb.
    await expect(header(page).getByText("Interview")).toBeVisible();
    await expect(feed(page)).toContainText("Moved from");
    await expect(feed(page)).toContainText("Applied");
  });

  test("shows the move without a second round trip to see it", async ({ page }) => {
    await openAt(page, "Applied");

    // Everything after the move's own request is refused. Nothing legitimate is
    // lost by that - the move answers with the history it wrote - so this stays
    // green until somebody reintroduces a follow-up request to show the result,
    // and the day that happens it goes red for the right reason.
    //
    // An aborted request rather than a refused one, because that is the failure
    // this guards: a dropped stream leaves a rejected fetch that TanStack Query
    // swallows, and a query holding stale data ignores the fresh `initialData`
    // the re-rendered page carries. The entry is then unreachable without a
    // reload.
    let writes = 0;
    await page.route("**/applications/**", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      writes += 1;
      await (writes > 1 ? route.abort("failed") : route.continue());
    });

    const menu = await openTransitionMenu(page);
    await menu.getByRole("menuitem", { name: "Interview" }).click();

    await expect(header(page).getByText("Interview")).toBeVisible();
    await expect(feed(page)).toContainText("Moved from");
  });

  test("still lands the move when its own read of the history fails", async ({ page }) => {
    const email = await openAt(page, "Applied");

    // Armed after the screen has rendered, so what fails is the read the move
    // makes rather than the one that seeded the panel.
    await failCalls(email, ["activity"]);

    const menu = await openTransitionMenu(page);
    await menu.getByRole("menuitem", { name: "Interview" }).click();

    // The move is what is guaranteed here, and it shows. The timeline is
    // deliberately left a beat behind rather than chased with a second request -
    // one issued now would race the re-render this very response is delivering,
    // which is the failure the single round trip exists to remove. Nothing on the
    // screen claims otherwise, so there is no refusal to read.
    await expect(header(page).getByText("Interview")).toBeVisible();
    await expect(refusal(page)).toHaveCount(0);
  });

  test("reads a closure as a closure", async ({ page }) => {
    await openAt(page, "Screening");

    const menu = await openTransitionMenu(page);
    await menu.getByRole("menuitem", { name: "Withdrawn" }).click();

    await expect(feed(page)).toContainText("Closed as");
    await expect(feed(page)).toContainText("Withdrawn");
  });

  test("shows the server's refusal, naming both stages, and does not move", async ({ page }) => {
    // The menu will not offer an illegal move, so the disagreement has to be
    // seeded: the client's model is a convenience and the server's is the truth.
    const email = await openAt(page, "Applied");
    await failCalls(email, ["transition-illegal"]);

    const menu = await openTransitionMenu(page);
    await menu.getByRole("menuitem", { name: "Screening" }).click();

    await expect(refusal(page)).toContainText(
      "An application cannot move from Applied to Screening.",
    );
    await expect(header(page).getByText("Applied")).toBeVisible();
  });

  test("waits out an in-flight key and re-issues the same one", async ({ page }) => {
    const email = await openAt(page, "Applied");
    await failCalls(email, ["transition-in-flight"]);

    const menu = await openTransitionMenu(page);
    await menu.getByRole("menuitem", { name: "Screening" }).click();

    // The retry is the action's, not the user's: one gesture, two requests, one
    // key - a new key would be a second move.
    // The action's own wait before re-issuing is a second at minimum, so this one
    // is slower than the rest by design - but only by that second.
    await expect(header(page).getByText("Screening")).toBeVisible();

    const keys = await idempotencyKeys(email);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  test("reports an outage as retryable rather than as a refusal", async ({ page }) => {
    const email = await openAt(page, "Applied");
    await failCalls(email, ["transition-unavailable"]);

    const menu = await openTransitionMenu(page);
    await menu.getByRole("menuitem", { name: "Screening" }).click();

    // Nothing about the request was wrong, so it must not read like a validation
    // failure.
    await expect(refusal(page)).toContainText("Try again in a moment.");
    await expect(header(page).getByText("Applied")).toBeVisible();
  });
});
