import { expect, test, type Page } from "@playwright/test";

import { anEmail, failCalls, registerThroughTheForm, seedApplications } from "./support";

// The only control in the product that destroys something, in both the places it
// appears. What is worth proving here rather than in a unit test is the part
// neither placement can fake: the list's rows live in a client cache that a
// server re-render cannot repair, so a row leaving the screen is evidence the
// component did the repairing.

// Fixed ids, so the detail route can be asked for by name rather than reached by
// clicking a link and waiting for the navigation to settle.
const DOOMED_ID = "11111111-1111-4111-8111-111111111111";
const DOOMED_URL = `/applications/${DOOMED_ID}`;

const ROWS = [
  { id: DOOMED_ID, role: "Frontend Engineer", companyName: "Acme" },
  { id: "22222222-2222-4222-8222-222222222222", role: "Platform Engineer", companyName: "Globex" },
];

function table(page: Page) {
  return page.getByRole("table", { name: "Applications" });
}

function dialog(page: Page) {
  return page.getByRole("dialog");
}

async function signInWithRows(page: Page): Promise<string> {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, ROWS);
  await page.goto("/applications");

  return email;
}

/**
 * Signs in and lands on the doomed application's own page.
 *
 * Asked for by URL rather than reached by clicking its row: `click` does not
 * wait for the navigation it starts, so everything after it is racing a page
 * that may not be there yet - and a `page.url()` read in that window hands back
 * the list, which then looks like the detail route serving after a delete.
 */
async function signInOnDetail(page: Page): Promise<string> {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, ROWS);
  await page.goto(DOOMED_URL);

  return email;
}

test.describe("deleting from the list", () => {
  test("each row's control names the row it belongs to", async ({ page }) => {
    await signInWithRows(page);

    // Twenty-six rows of "Delete" is a list of identical choices to anyone
    // navigating by control rather than by eye.
    await expect(page.getByRole("button", { name: "Delete Frontend Engineer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete Platform Engineer" })).toBeVisible();
  });

  test("asks first, and says what goes with it", async ({ page }) => {
    await signInWithRows(page);

    await page.getByRole("button", { name: "Delete Frontend Engineer" }).click();

    await expect(dialog(page)).toContainText("Delete Frontend Engineer?");
    await expect(dialog(page)).toContainText("Its interviews, contacts and history go with it");
  });

  test("cancelling leaves the row alone", async ({ page }) => {
    await signInWithRows(page);

    await page.getByRole("button", { name: "Delete Frontend Engineer" }).click();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();

    await expect(dialog(page)).toBeHidden();
    await expect(table(page).getByRole("row")).toHaveCount(3);
    await expect(table(page)).toContainText("Frontend Engineer");
  });

  test("confirming takes the row off the screen and leaves its neighbour", async ({ page }) => {
    await signInWithRows(page);

    await page.getByRole("button", { name: "Delete Frontend Engineer" }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();

    // The dialog is modal, so the table is out of the accessibility tree until
    // it closes. Waiting for that first is the difference between asserting on
    // the list and asserting on nothing.
    await expect(dialog(page)).toBeHidden();

    // Without the cache repair this row would still be here: the pages were
    // seeded once and a query already holding data ignores a fresh initialData,
    // so revalidating the route on the server changes nothing the reader sees.
    await expect(table(page)).not.toContainText("Frontend Engineer");
    await expect(table(page)).toContainText("Platform Engineer");
    await expect(table(page).getByRole("row")).toHaveCount(2);
  });

  test("it survives a reload, so the row really went", async ({ page }) => {
    await signInWithRows(page);

    await page.getByRole("button", { name: "Delete Frontend Engineer" }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(table(page)).not.toContainText("Frontend Engineer");

    await page.reload();

    // The half the cache repair cannot prove on its own: a component that only
    // hid the row would pass every assertion above and fail this one.
    await expect(table(page)).not.toContainText("Frontend Engineer");
    await expect(table(page)).toContainText("Platform Engineer");
  });

  test("a refusal keeps the row and says nothing was deleted", async ({ page }) => {
    const email = await signInWithRows(page);
    await failCalls(email, ["delete-application"]);

    await page.getByRole("button", { name: "Delete Frontend Engineer" }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();

    // The dialog stays open carrying the reason, rather than closing on a row
    // that is still there.
    await expect(dialog(page)).toContainText("Nothing was deleted.");

    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(table(page)).toContainText("Frontend Engineer");
  });
});

test.describe("deleting from the detail view", () => {
  test("sits beside Status and returns to the list", async ({ page }) => {
    await signInOnDetail(page);

    await expect(page.getByRole("button", { name: "Status" })).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page).toHaveURL(/\/applications$/);
    await expect(table(page)).not.toContainText("Frontend Engineer");
  });

  test("the page it was on is a 404 afterwards, with a way out", async ({ page }) => {
    await signInOnDetail(page);

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/applications$/);

    // The URL changes before the redirect has finished settling, and a goto
    // issued in that window is overtaken by it. Waiting for the list to be on
    // screen is what makes the next navigation the one being measured.
    await expect(table(page)).toBeVisible();

    // Asked for again once it has nothing behind it. A reader reaches it the
    // same way: a bookmark, an open tab, the history.
    await page.goto(DOOMED_URL);

    // The route's own not-found rather than the global one, and the rendered
    // page rather than the status. The second is not a softer assertion, it is
    // the only true one: every route here is dynamic, so the shell streams
    // before the page component runs and the 200 is already on the wire by the
    // time `notFound()` is reached. A route that does not exist at all resolves
    // before any of that and really does answer 404 - not-found.spec.ts is
    // where that belongs. What matters here is that the reader is told, and is
    // handed the way back rather than left on a dead page.
    await expect(page.getByText("We could not find that application")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to all applications" })).toBeVisible();
  });
});
