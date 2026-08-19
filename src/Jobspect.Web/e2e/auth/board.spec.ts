import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  applicationRequestCount,
  closeOutZone,
  dragCardTo,
  dragCardToCloseOut,
  failCalls,
  failStageReads,
  idempotencyKeys,
  liftCard,
  openTransitionMenu,
  registerThroughTheForm,
  seedApplications,
} from "./support";

// Four columns from four filtered reads, honest answers at the three edges a
// board has - a stage with nothing in it, a stage holding more than one page,
// and a stage whose read went down - and the drag that moves a card between
// them.

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
 * The board's own alert.
 *
 * Scoped to `main` because Next appends a route announcer to the body with
 * `role="alert"` on it. That one is empty and always present, so an unscoped
 * query matches two things and resolves to the wrong one.
 */
function refusal(page: Page) {
  return page.getByRole("main").getByRole("alert");
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

test.describe("dragging a card", () => {
  test("moves it to the column it was dropped on", async ({ page }) => {
    await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    await dragCardTo(page, "Frontend Engineer", "Screening");

    // Both columns, because a move that only adds is a move that duplicated.
    await expect(column(page, "Screening")).toContainText("Frontend Engineer");
    await expect(column(page, "Applied")).not.toContainText("Frontend Engineer");
    await expect(column(page, "Applied")).toContainText("Nothing in this stage.");
  });

  test("lets a card skip a stage", async ({ page }) => {
    // The API permits a jump forward, so a drop is not restricted to the
    // adjacent column.
    await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    await dragCardTo(page, "Frontend Engineer", "Offer");

    await expect(column(page, "Offer")).toContainText("Frontend Engineer");
  });

  test("survives the answer rather than snapping back on success", async ({ page }) => {
    // The assertion that makes the whole design load-bearing. React drops an
    // optimistic value the moment the action settles, so the card stays put only
    // because the action revalidated this route and the columns it re-rendered
    // are the new truth. Remove that revalidation and this goes red while the
    // move still lands - a success that looks exactly like a refusal.
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    await dragCardTo(page, "Frontend Engineer", "Interview");
    await expect(column(page, "Interview")).toContainText("Frontend Engineer");

    // Still there a beat later, rather than caught mid-transition. A poll that a
    // race can win is not an assertion.
    await expect(async () => {
      expect(await applicationRequestCount(email)).toBeGreaterThan(1);
      await expect(column(page, "Interview")).toContainText("Frontend Engineer");
    }).toPass();

    await page.reload();
    await expect(column(page, "Interview")).toContainText("Frontend Engineer");
  });

  test("does not accept a drop on an earlier column", async ({ page }) => {
    // The pipeline has no backward move for a live application, so the board
    // does not offer one. Nothing is sent and nothing is refused.
    const email = await signInWith(page, [{ stage: "Interview", role: "Frontend Engineer" }]);

    await dragCardTo(page, "Frontend Engineer", "Applied");

    await expect(column(page, "Interview")).toContainText("Frontend Engineer");
    await expect(column(page, "Applied")).toContainText("Nothing in this stage.");
    expect(await idempotencyKeys(email), "no write was attempted").toEqual([]);
  });

  test("returns the card and says why when the pipeline refuses", async ({ page }) => {
    // The real route to this is a second tab: nothing invalidates another tab's
    // Router Cache, so its board can offer a move the server has already made
    // impossible. Armed here because one browser cannot be made to do it on
    // demand.
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);
    await failCalls(email, ["transition-illegal"]);

    await dragCardTo(page, "Frontend Engineer", "Screening");

    // The server's own sentence, which names both stages.
    await expect(refusal(page)).toContainText("cannot move from");
    // And the card is back, with no rollback code behind it: nothing ever really
    // moved, so the optimistic value simply stopped rendering.
    await expect(column(page, "Applied")).toContainText("Frontend Engineer");
    await expect(column(page, "Screening")).toContainText("Nothing in this stage.");
  });

  test("reuses one key when the first attempt is still in flight", async ({ page }) => {
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);
    await failCalls(email, ["transition-in-flight"]);

    await dragCardTo(page, "Frontend Engineer", "Screening");

    await expect(column(page, "Screening")).toContainText("Frontend Engineer");

    // Polled rather than read once. The optimistic card renders before the
    // request is even sent, so the screen showing the move says nothing yet about
    // what went out - and the retry waits out a Retry-After on top of that.
    await expect.poll(() => idempotencyKeys(email)).toHaveLength(2);

    // Two requests, one key. A fresh key on the retry is how one drag becomes two
    // moves, which is the guarantee ADR 0011 exists for.
    expect(new Set(await idempotencyKeys(email)).size).toBe(1);
  });

  test("costs one write and one repaint", async ({ page }) => {
    // Five reads for the board plus the move itself. The per-IP limiter is shared
    // by every user of a deployment, and a drag per card multiplies whatever this
    // number is, so it is asserted rather than assumed.
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    const before = await applicationRequestCount(email);
    await dragCardTo(page, "Frontend Engineer", "Screening");
    await expect(column(page, "Screening")).toContainText("Frontend Engineer");

    // The repaint the action revalidates into, waited for rather than caught: the
    // optimistic card is on screen before a single request has gone out.
    await expect.poll(() => applicationRequestCount(email)).toBe(before + 5);

    // And it rests there. A sixth read arriving a moment later is exactly the
    // regression this exists to catch, and an assertion that stopped at the fifth
    // would never see it.
    await page.waitForTimeout(1_000);
    expect((await applicationRequestCount(email)) - before).toBe(5);
    expect(await idempotencyKeys(email)).toHaveLength(1);
  });

  test("shows the move without a second round trip to see it", async ({ page }) => {
    await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    // Everything after the move's own request is refused. Nothing legitimate is
    // lost by that - the action re-renders this route inside its own response -
    // so this stays green until somebody reintroduces a follow-up request, and
    // the day that happens it goes red for the right reason.
    let writes = 0;
    await page.route("**/board**", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      writes += 1;
      await (writes > 1 ? route.abort("failed") : route.continue());
    });

    await dragCardTo(page, "Frontend Engineer", "Screening");

    await expect(column(page, "Screening")).toContainText("Frontend Engineer");
    await expect(column(page, "Applied")).toContainText("Nothing in this stage.");
  });
});

test.describe("closing a card out", () => {
  test("offers no zone until a card is in hand", async ({ page }) => {
    // Closing happens once per application, and a strip standing across the board
    // for it would be weight the rest of the time. It arrives with the gesture
    // that can use it.
    await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    await expect(closeOutZone(page)).toBeHidden();

    await liftCard(page, "Frontend Engineer");
    await expect(closeOutZone(page)).toBeVisible();

    await page.mouse.up();
  });

  test("asks which outcome rather than deciding one", async ({ page }) => {
    // The drop is the question, not the answer. Nothing moves and nothing is
    // written until the picker has been answered - a card that left its column
    // here would be claiming a decision the user has not made.
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    const picker = await dragCardToCloseOut(page, "Frontend Engineer");

    await expect(picker).toContainText("Close out Frontend Engineer");
    expect(await idempotencyKeys(email), "no write was attempted").toEqual([]);

    // The columns are deliberately not read here. The picker is modal, so the
    // board behind it is out of the accessibility tree and `column()` finds
    // nothing at all - which is correct, and is why the card's position is
    // asserted by the dismissal spec below instead of from in here.
  });

  test("offers Accepted from Offer and from nowhere else", async ({ page }) => {
    // The state machine, asserted where a user meets it: Accepted is the one
    // outcome that has to be earned, so only an application holding an offer can
    // reach it. Offering it elsewhere would invite a refusal.
    await signInWith(page, [
      { stage: "Offer", role: "Has an offer" },
      { stage: "Applied", role: "Just applied" },
    ]);

    const fromOffer = await dragCardToCloseOut(page, "Has an offer");
    for (const outcome of ["Accepted", "Rejected", "Withdrawn", "Ghosted"]) {
      await expect(fromOffer.getByRole("button", { name: outcome })).toBeVisible();
    }

    await fromOffer.getByRole("button", { name: "Cancel" }).click();
    await expect(fromOffer).toBeHidden();

    const fromApplied = await dragCardToCloseOut(page, "Just applied");
    await expect(fromApplied.getByRole("button", { name: "Accepted" })).toBeHidden();
    for (const outcome of ["Rejected", "Withdrawn", "Ghosted"]) {
      await expect(fromApplied.getByRole("button", { name: outcome })).toBeVisible();
    }
  });

  test("takes the card off the board and counts it under the chip", async ({ page }) => {
    // The board holds no column for a closed application (ADR 0001), so the card
    // leaves rather than moving. The chip is the only route to it from here.
    await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);
    await expect(page.getByRole("link", { name: "0 closed" })).toBeVisible();

    const picker = await dragCardToCloseOut(page, "Frontend Engineer");
    await picker.getByRole("button", { name: "Rejected" }).click();

    await expect(column(page, "Applied")).toContainText("Nothing in this stage.");
    await expect(page.getByRole("link", { name: "1 closed" })).toBeVisible();
  });

  test("survives the answer rather than snapping back on success", async ({ page }) => {
    // React drops an optimistic value the moment the action settles, so the card
    // stays gone only because the action revalidated this route. Remove that and
    // this goes red while the close still lands.
    await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    const picker = await dragCardToCloseOut(page, "Frontend Engineer");
    await picker.getByRole("button", { name: "Withdrawn" }).click();

    await expect(column(page, "Applied")).toContainText("Nothing in this stage.");

    await page.reload();
    await expect(column(page, "Applied")).toContainText("Nothing in this stage.");
    await expect(page.getByRole("link", { name: "1 closed" })).toBeVisible();
  });

  test("changes nothing when the picker is dismissed", async ({ page }) => {
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    const picker = await dragCardToCloseOut(page, "Frontend Engineer");
    await picker.getByRole("button", { name: "Cancel" }).click();

    await expect(picker).toBeHidden();
    await expect(column(page, "Applied")).toContainText("Frontend Engineer");
    expect(await idempotencyKeys(email), "no write was attempted").toEqual([]);
  });

  test("returns the card and says why when the pipeline refuses", async ({ page }) => {
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);
    await failCalls(email, ["transition-illegal"]);

    const picker = await dragCardToCloseOut(page, "Frontend Engineer");
    await picker.getByRole("button", { name: "Ghosted" }).click();

    // The board's one alert region, shared with the drag: by the time it renders
    // the card is back where it was, which may be scrolled out of view.
    await expect(refusal(page)).toContainText("cannot move from");
    await expect(column(page, "Applied")).toContainText("Frontend Engineer");
  });

  test("reuses one key when the first attempt is still in flight", async ({ page }) => {
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);
    await failCalls(email, ["transition-in-flight"]);

    const picker = await dragCardToCloseOut(page, "Frontend Engineer");
    await picker.getByRole("button", { name: "Rejected" }).click();

    await expect.poll(() => idempotencyKeys(email)).toHaveLength(2);

    // Two requests, one key. A fresh key on the retry is how one close-out becomes
    // two moves, which is the guarantee ADR 0011 exists for.
    expect(new Set(await idempotencyKeys(email)).size).toBe(1);
  });

  test("costs one write and one repaint", async ({ page }) => {
    // The same budget the drag has. The per-IP limiter is shared by every user of
    // a deployment, so a second gesture that cost more would be worth knowing
    // about before it shipped.
    const email = await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);

    const before = await applicationRequestCount(email);
    const picker = await dragCardToCloseOut(page, "Frontend Engineer");
    await picker.getByRole("button", { name: "Rejected" }).click();

    await expect(column(page, "Applied")).toContainText("Nothing in this stage.");
    await expect.poll(() => applicationRequestCount(email)).toBe(before + 5);

    // And it rests there. A sixth read arriving a moment later is exactly the
    // regression this exists to catch.
    await page.waitForTimeout(1_000);
    expect((await applicationRequestCount(email)) - before).toBe(5);
    expect(await idempotencyKeys(email)).toHaveLength(1);
  });
});

test.describe("the drag against the policy", () => {
  test("lifts a card without violating the content security policy", async ({ page }) => {
    // The assertion that earns its place, because every other drag test passed
    // while this was broken. dnd-kit injects the stylesheet that positions the
    // lifted card, and `style-src` here is nonce-based - so an untagged one is
    // refused, the card lifts to the top-left corner of the page and stays
    // there, and nothing in the DOM says anything is wrong. Every drag test
    // still passed. The browser's own complaint is the only thing that notices.
    //
    // Discriminated by directive rather than by the blocked content, and that is
    // forced rather than chosen: `sample` is only populated when the policy names
    // `'report-sample'`, so it is the empty string for every violation here and
    // filtering on it asserts nothing at all. Checked by mutation - a version of
    // this test that read `sample` stayed green with the nonce removed entirely.
    //
    // `style-src-elem` is the stylesheet, which is the one that matters. One
    // `style-src-attr` violation survives on purpose: dnd-kit clears an element's
    // styles by writing an empty `style` attribute, and a nonce cannot cover a
    // style attribute at all. Blocking an empty attribute removes nothing, and
    // relaxing the policy to permit every inline style in the application would
    // be a poor trade for a silent log line.
    const blocked: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        const violation = event as SecurityPolicyViolationEvent;
        console.log(`BLOCKED ${violation.effectiveDirective}`);
      });
    });
    page.on("console", (message) => {
      if (message.text() === "BLOCKED style-src-elem") blocked.push(message.text());
    });

    await signInWith(page, [{ stage: "Applied", role: "Frontend Engineer" }]);
    await dragCardTo(page, "Frontend Engineer", "Screening");
    await expect(column(page, "Screening")).toContainText("Frontend Engineer");

    expect(blocked).toEqual([]);
  });
});

test.describe("a move made somewhere else", () => {
  test("reaches the board when it is next opened", async ({ page }) => {
    // A behaviour worth holding whatever makes it true, rather than a test for
    // one line: removing `revalidatePath('/board')` does not turn this red,
    // because any revalidation in an action already drops the client Router
    // Cache. What must not regress is the user-visible fact - a move made on the
    // detail screen is on the board the next time it is opened, without a reload.
    const id = "88888888-8888-4888-8888-888888888888";
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedApplications(email, [{ id, stage: "Applied", role: "Frontend Engineer" }]);

    // Visited first, so the board is in the Router Cache to go stale.
    await page.goto("/board");
    await expect(column(page, "Applied")).toContainText("Frontend Engineer");

    await page.goto(`/applications/${id}`);
    const menu = await openTransitionMenu(page);
    await menu.getByRole("menuitem", { name: "Interview" }).click();

    // Waited out before navigating, which is both what a user does and what
    // keeps this deterministic: a click dispatched while the move's transition is
    // still running is swallowed, and the symptom is a navigation that simply
    // never happens.
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByText("Interview").first()).toBeVisible();

    // Navigated rather than reloaded: a reload would bypass the Router Cache and
    // pass however stale the cache is.
    await page.getByRole("banner").getByRole("link", { name: "Board" }).click();
    await expect(page).toHaveURL(/\/board$/, { timeout: 15_000 });

    // Longer than the default five seconds, and the reason is the same one the
    // registration helper gives: this single assertion waits on a client-side
    // navigation and then on the board's five parallel reads. At six workers the
    // default budget runs out here first, which showed up as the columns not
    // existing yet rather than as the card being in the wrong one.
    await expect(column(page, "Interview")).toContainText("Frontend Engineer", {
      timeout: 15_000,
    });
    await expect(column(page, "Applied")).toContainText("Nothing in this stage.");
  });
});
