import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  applicationRequestCount,
  expireCursors,
  registerThroughTheForm,
  seedApplications,
} from "./support";

// Filters and sort live in the URL; the cursor never does. Everything here is
// about that split and about the walk the cursor drives.

/** More than one page of 25, so a cursor exists at all. */
function manyApplications(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    role: `Engineer ${String(index).padStart(3, "0")}`,
    stage: index % 2 === 0 ? "Applied" : "Offer",
    // Descending by applied date puts the highest index first.
    appliedDate: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
  }));
}

function table(page: Page) {
  return page.getByRole("table", { name: "Applications" });
}

function rowCount(page: Page) {
  // Minus the header row, which getByRole("row") counts too.
  return table(page)
    .getByRole("row")
    .count()
    .then((count) => count - 1);
}

/**
 * Page two arrives when the end of the list comes into view, so a spec about it
 * has to actually get there. Twenty-five rows are taller than the viewport.
 */
async function scrollToEnd(page: Page) {
  // Driven off the last row rather than window.scrollTo, so it works whatever
  // element is doing the scrolling - which is what a real scroll gesture does.
  await table(page).getByRole("row").last().scrollIntoViewIfNeeded();
}

async function signInWith(page: Page, count: number) {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, manyApplications(count));
  await page.goto("/applications");
  return email;
}

test.describe("filtering and sorting", () => {
  test("puts the filter in the URL and narrows the list", async ({ page }) => {
    await signInWith(page, 6);
    await expect(table(page).getByRole("row")).toHaveCount(7);

    await page.getByRole("button", { name: "Offer", exact: true }).click();

    await expect(page).toHaveURL(/stage=Offer/);
    // Three of the six were seeded into Offer. The server re-rendered: this is
    // what `shallow: false` buys, and without it the URL would change alone.
    await expect(table(page).getByRole("row")).toHaveCount(4);
  });

  test("renders the same list when the URL is opened directly", async ({ page }) => {
    const email = await signInWith(page, 6);

    // What a shared link has to do. The first page comes from the server, so
    // this is the server reading the filter rather than the client re-applying
    // it after a render.
    await page.goto("/applications?stage=Offer");

    await expect(table(page).getByRole("row")).toHaveCount(4);
    expect(email).toBeTruthy();
  });

  test("puts the sort in the URL and changes the order", async ({ page }) => {
    await signInWith(page, 4);

    const firstBefore = await table(page).getByRole("row").nth(1).textContent();

    await page.getByRole("button", { name: "Oldest first" }).click();
    await expect(page).toHaveURL(/sortDirection=asc/);

    await expect(table(page).getByRole("row").nth(1)).not.toHaveText(firstBefore ?? "");
  });

  test("ignores a stage nobody offers rather than failing", async ({ page }) => {
    await signInWith(page, 4);

    // A typo in a shared link. The query drops what it does not recognise, so
    // this is an unfiltered list rather than a 422 the reader cannot act on.
    await page.goto("/applications?stage=Onboarding");

    await expect(table(page).getByRole("row")).toHaveCount(5);
  });
});

test.describe("the walk", () => {
  test("never puts the cursor in the URL", async ({ page }) => {
    await signInWith(page, 60);

    await scrollToEnd(page);
    await expect.poll(() => rowCount(page)).toBe(50);
    await page.getByRole("button", { name: "Load more" }).click();
    await expect.poll(() => rowCount(page)).toBe(60);

    // A keyset cursor is a position in a walk, not a page number: a link to one
    // means nothing to anybody whose list has moved since.
    expect(new URL(page.url()).search).not.toContain("cursor");
  });

  test("loads page two on its own and makes page three wait", async ({ page }) => {
    await signInWith(page, 60);

    // Nothing has been asked for yet, and nothing beyond the first page has
    // arrived. The observer is armed but the end of the list is below the fold.
    await expect.poll(() => rowCount(page)).toBe(25);

    await scrollToEnd(page);

    // Page two arrives without being asked for, because the end came into view.
    await expect.poll(() => rowCount(page)).toBe(50);

    // And then it stops, even though the end is still in view. The long case
    // stays controllable.
    await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
    await scrollToEnd(page);
    await expect.poll(() => rowCount(page)).toBe(50);

    await page.getByRole("button", { name: "Load more" }).click();

    await expect.poll(() => rowCount(page)).toBe(60);
    await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
  });

  test("does not fetch the page the server already rendered", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedApplications(email, manyApplications(10));

    await page.goto("/applications");
    await expect(table(page).getByRole("row")).toHaveCount(11);

    // Two server renders and no client fetch: registration redirected to this
    // screen once and the navigation above rendered it again. A third request
    // would mean initialData was keyed wrongly and the client went and fetched
    // what the server had just handed it.
    expect(await applicationRequestCount(email)).toBe(2);
  });

  test("resets the walk silently when the cursor goes stale", async ({ page }) => {
    const email = await signInWith(page, 60);
    await scrollToEnd(page);
    await expect.poll(() => rowCount(page)).toBe(50);

    await expireCursors(email);
    await page.getByRole("button", { name: "Load more" }).click();

    // Back to one page, and nothing on screen says so. The user asked for more
    // and got a refresh, which is the honest thing to show for a cursor they do
    // not know they have.
    await expect.poll(() => rowCount(page)).toBe(25);
    await expect(page.getByText(/error|failed|went wrong/i)).toHaveCount(0);
  });
});
