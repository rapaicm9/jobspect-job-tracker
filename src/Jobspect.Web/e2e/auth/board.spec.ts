import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  applicationRequestCount,
  failStageReads,
  registerThroughTheForm,
  seedApplications,
} from "./support";

// The read, and nothing that moves. Everything the drag is layered on: four
// columns from four filtered reads, and honest answers at the three edges a
// board has - a stage with nothing in it, a stage holding more than one page,
// and a stage whose read went down.

const DAY = 24 * 60 * 60 * 1000;

/**
 * Dates relative to the machine's clock, because the chip is.
 *
 * An account registered through the form is on UTC - the form sends no zone and
 * the API defaults it - so a UTC calendar day is the day the screen is computing
 * against. Literal dates would pass this week and start failing next week.
 */
function inDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}

function column(page: Page, stage: string) {
  return page.getByRole("region", { name: stage });
}

/**
 * The list's stage filter, scoped to its own fieldset.
 *
 * The sort control beside it is also labelled "Applied" - it is the applied-date
 * sort, pressed by default - so an unscoped query for a pressed button by that
 * name matches two things that mean different things.
 */
function stageFilter(page: Page, stage: string) {
  return page.getByRole("group", { name: "Filter by stage" }).getByRole("button", { name: stage });
}

async function signInWith(page: Page, applications: Record<string, unknown>[]): Promise<string> {
  const email = anEmail();
  await registerThroughTheForm(page, email);

  if (applications.length > 0) await seedApplications(email, applications);
  await page.goto("/board");

  return email;
}

function manyIn(stage: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    stage,
    role: `Engineer ${String(index).padStart(3, "0")}`,
    // Descending applied dates, so the order the board renders is the order the
    // API's default sort produces rather than insertion order.
    appliedDate: inDays(-index - 1),
  }));
}

test.describe("the board", () => {
  test("shows the four active stages and nothing else", async ({ page }) => {
    await signInWith(page, [
      { stage: "Applied", role: "One" },
      { stage: "Screening", role: "Two" },
      { stage: "Interview", role: "Three" },
      { stage: "Offer", role: "Four" },
      // Closed, so it belongs behind the chip rather than in a column. ADR 0001
      // keeps unordered outcomes off an axis that means order.
      { stage: "Rejected", role: "Five" },
    ]);

    for (const stage of ["Applied", "Screening", "Interview", "Offer"]) {
      await expect(page.getByRole("heading", { name: stage, level: 2 })).toBeVisible();
    }

    await expect(page.getByRole("heading", { name: "Rejected", level: 2 })).toBeHidden();
    await expect(page.getByText("Five")).toBeHidden();
  });

  test("puts each application in the column its stage names", async ({ page }) => {
    await signInWith(page, [
      { stage: "Applied", role: "Just applied" },
      { stage: "Offer", role: "Got an offer" },
    ]);

    await expect(column(page, "Applied")).toContainText("Just applied");
    await expect(column(page, "Applied")).not.toContainText("Got an offer");
    await expect(column(page, "Offer")).toContainText("Got an offer");
  });

  test("carries role, company and the applied date on a card", async ({ page }) => {
    await signInWith(page, [
      {
        stage: "Interview",
        role: "Frontend Engineer",
        companyName: "Acme",
        appliedDate: "2026-08-01",
      },
    ]);

    const card = column(page, "Interview").getByRole("listitem");

    await expect(card).toContainText("Frontend Engineer");
    await expect(card).toContainText("Acme");
    // Formatted for a reader, and the machine-readable value kept beside it.
    await expect(card).toContainText("1 Aug 2026");
    await expect(card.locator("time").first()).toHaveAttribute("datetime", "2026-08-01");
  });

  test("links a card to the application it names", async ({ page }) => {
    const id = "77777777-7777-4777-8777-777777777777";
    await signInWith(page, [{ id, stage: "Applied", role: "Frontend Engineer" }]);

    await column(page, "Applied").getByRole("link", { name: "Frontend Engineer" }).click();

    await expect(page).toHaveURL(new RegExp(`/applications/${id}$`));
  });

  test("counts what the column is showing", async ({ page }) => {
    await signInWith(page, manyIn("Screening", 3));

    await expect(column(page, "Screening")).toContainText("3");
    await expect(column(page, "Screening").getByRole("listitem")).toHaveCount(3);
  });

  test("says one line for a stage with nothing in it", async ({ page }) => {
    // A job search legitimately has nothing in Offer, and dressing that up as an
    // event would be wrong about it.
    await signInWith(page, [{ stage: "Applied", role: "One" }]);

    await expect(column(page, "Offer")).toContainText("Nothing in this stage.");
  });

  test("offers the empty account somewhere to start", async ({ page }) => {
    await signInWith(page, []);

    await expect(page.getByText("No applications yet")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Applied", level: 2 })).toBeHidden();
  });

  test("does not call an account with everything closed empty", async ({ page }) => {
    // Every column is empty and the account is anything but new. Offering it
    // "record your first application" would be wrong about what happened.
    await signInWith(page, [{ stage: "Rejected", role: "One" }]);

    await expect(page.getByText("No applications yet")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Applied", level: 2 })).toBeVisible();
  });

  test("paints in five reads", async ({ page }) => {
    // Four columns and the closed count, and no more. A move costs a write plus
    // this whole paint, so a sixth read here is a sixth on every drag - and the
    // per-IP limiter is already reachable at mouse speed.
    const email = await signInWith(page, [{ stage: "Applied", role: "One" }]);

    const before = await applicationRequestCount(email);
    await page.goto("/board");
    await expect(page.getByRole("heading", { name: "Applied", level: 2 })).toBeVisible();

    expect((await applicationRequestCount(email)) - before).toBe(5);
  });
});

test.describe("the deadline chip", () => {
  test("appears over the window the account is already being reminded about", async ({ page }) => {
    await signInWith(page, [
      { stage: "Applied", role: "Due today", applicationDeadline: inDays(0) },
      { stage: "Applied", role: "Due tomorrow", applicationDeadline: inDays(1) },
      { stage: "Applied", role: "Due in three", applicationDeadline: inDays(3) },
    ]);

    const applied = column(page, "Applied");

    await expect(applied).toContainText("Due today");
    await expect(applied).toContainText("Due tomorrow");
    await expect(applied).toContainText("Due in 3 days");
  });

  test("says nothing about a deadline that is not near yet", async ({ page }) => {
    // A chip on every card is a chip that means nothing.
    await signInWith(page, [
      { stage: "Applied", role: "Far off", applicationDeadline: inDays(30) },
      { stage: "Applied", role: "No deadline" },
    ]);

    await expect(column(page, "Applied")).toContainText("Far off");
    await expect(column(page, "Applied")).not.toContainText("Due in");
  });

  test("keeps saying so once the day has passed", async ({ page }) => {
    await signInWith(page, [
      { stage: "Applied", role: "Missed it", applicationDeadline: inDays(-2) },
    ]);

    await expect(column(page, "Applied")).toContainText("Overdue");
  });
});

test.describe("a column holding more than one page", () => {
  // One over the API's ceiling, so the notice and its link exist at all. Both are
  // branches that only appear above a threshold no ordinary fixture reaches, and
  // both would otherwise ship unread.
  const OVER_THE_CEILING = 101;

  test("says so rather than showing a hundred and stopping", async ({ page }) => {
    await signInWith(page, manyIn("Applied", OVER_THE_CEILING));

    await expect(column(page, "Applied").getByRole("listitem")).toHaveCount(100);
    await expect(column(page, "Applied")).toContainText("Showing the first 100");
    await expect(column(page, "Applied")).toContainText("More are not loaded");
  });

  test("hands off to a list that is already filtered to that stage", async ({ page }) => {
    await signInWith(page, manyIn("Applied", OVER_THE_CEILING));

    await column(page, "Applied")
      .getByRole("link", { name: "see every Applied application" })
      .click();

    await expect(page).toHaveURL(/\/applications\?stage=Applied/);
    // The filter is on, not merely in the address bar: the bar's own control
    // reads pressed, which is what the list renders from the parsed value.
    await expect(stageFilter(page, "Applied")).toHaveAttribute("aria-pressed", "true");
    await expect(stageFilter(page, "Offer")).toHaveAttribute("aria-pressed", "false");
  });

  test("leaves a column inside the ceiling saying nothing", async ({ page }) => {
    await signInWith(page, manyIn("Applied", 100));

    await expect(column(page, "Applied")).not.toContainText("More are not loaded");
  });
});

test.describe("the closed chip", () => {
  test("counts the applications the board holds no column for", async ({ page }) => {
    await signInWith(page, [
      { stage: "Accepted", role: "One" },
      { stage: "Rejected", role: "Two" },
      { stage: "Withdrawn", role: "Three" },
    ]);

    await expect(page.getByRole("link", { name: "3 closed" })).toBeVisible();
  });

  test("says 100+ rather than a number it does not have", async ({ page }) => {
    // The list endpoint returns no totals, so the count is the length of one
    // bounded read. It is exact right up until it isn't, and then it says so.
    await signInWith(page, manyIn("Ghosted", 101));

    await expect(page.getByRole("link", { name: "100+ closed" })).toBeVisible();
  });

  test("is the only route to them, so it filters the list to all four", async ({ page }) => {
    await signInWith(page, [{ stage: "Rejected", role: "One" }]);

    await page.getByRole("link", { name: "1 closed" }).click();

    for (const stage of ["Accepted", "Rejected", "Withdrawn", "Ghosted"]) {
      await expect(stageFilter(page, stage)).toHaveAttribute("aria-pressed", "true");
    }

    // And none of the active four, which is the half that would still pass if the
    // link had filtered to nothing at all.
    await expect(stageFilter(page, "Applied")).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("a read that failed", () => {
  test("costs one column, not the board", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedApplications(email, [
      { stage: "Applied", role: "Still here" },
      { stage: "Offer", role: "Cannot be read" },
    ]);

    await failStageReads(email, ["Offer"]);
    await page.goto("/board");

    await expect(column(page, "Offer")).toContainText("Offer could not be loaded.");
    // The three that worked are still the answer to what the reader came for.
    await expect(column(page, "Applied")).toContainText("Still here");
    await expect(column(page, "Screening")).toContainText("Nothing in this stage.");
  });

  test("does not let a failed column read as an empty one", async ({ page }) => {
    // The distinction the whole degraded state exists for: "nothing in Offer" is
    // a fact about the job search, and it must not be what an outage looks like.
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await failStageReads(email, ["Offer"]);
    await page.goto("/board");

    await expect(column(page, "Offer")).not.toContainText("Nothing in this stage.");
  });

  test("keeps the closed chip navigable when its count could not be read", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await failStageReads(email, ["Accepted", "Rejected", "Withdrawn", "Ghosted"]);
    await page.goto("/board");

    // No number, because there isn't one - but the link stays, since it is the
    // only route to the closed applications.
    await expect(page.getByRole("link", { name: "Closed applications" })).toBeVisible();
  });
});
