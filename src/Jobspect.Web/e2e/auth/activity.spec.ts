import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  failCalls,
  idempotencyKeys,
  registerThroughTheForm,
  seedAccount,
  seedActivity,
  seedApplications,
  signInThroughTheForm,
} from "./support";

// The first write in this client, and the one list that grows at the head while
// it is being read.

const APPLICATION_ID = "77777777-7777-4777-8777-777777777777";

const APPLICATION = {
  id: APPLICATION_ID,
  role: "Frontend Engineer",
  companyName: "Acme",
  stage: "Interview",
};

const HISTORY = [
  { kind: "Created", toStage: "Applied", occurredAt: "2026-08-01T09:00:00Z" },
  {
    kind: "StageChanged",
    fromStage: "Applied",
    toStage: "Screening",
    transitionKind: "Advance",
    occurredAt: "2026-08-03T10:00:00Z",
  },
  { kind: "Note", note: "Recruiter called.", occurredAt: "2026-08-05T11:00:00Z" },
];

/**
 * The history itself, never the panel around it.
 *
 * The composer lives in the same panel and a controlled `<textarea>` renders its
 * value as text, so a panel-wide `toContainText` is answered by whatever the user
 * has just typed - which passes before the note has been written and leaves the
 * assertion racing the request it was meant to wait for.
 */
function feed(page: Page) {
  return page.getByRole("list", { name: "Activity" });
}

/** The panel, for the states that render instead of the list. */
function panel(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "Activity" }) });
}

async function openWithHistory(page: Page, entries: Record<string, unknown>[]): Promise<string> {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, [APPLICATION]);
  await seedActivity(email, APPLICATION_ID, entries);
  await page.goto(`/applications/${APPLICATION_ID}`);

  return email;
}

test.describe("the activity timeline", () => {
  test("reads each kind as the event it was", async ({ page }) => {
    await openWithHistory(page, HISTORY);

    const entries = feed(page);

    await expect(entries).toContainText("Application recorded at");
    await expect(entries).toContainText("Moved from");
    await expect(entries).toContainText("Recruiter called.");
  });

  test("names a closure by its outcome rather than by where it came from", async ({ page }) => {
    // "Moved from Offer to Rejected" is true and reports the wrong event.
    await openWithHistory(page, [
      {
        kind: "StageChanged",
        fromStage: "Offer",
        toStage: "Rejected",
        transitionKind: "Terminal",
        occurredAt: "2026-08-06T09:00:00Z",
      },
    ]);

    await expect(feed(page)).toContainText("Closed as");
    await expect(feed(page)).not.toContainText("Moved from");
  });

  test("renders each instant in the account's zone", async ({ page }) => {
    const email = anEmail();

    // Seeded rather than registered: the register form sends no zone and the API
    // defaults it, so an account made through the UI is always UTC and this
    // assertion would pass however the instant was formatted.
    await seedAccount(email, "Australia/Sydney");
    await signInThroughTheForm(page, email);
    await expect(page).toHaveURL(/\/applications$/, { timeout: 15_000 });

    await seedApplications(email, [APPLICATION]);
    await seedActivity(email, APPLICATION_ID, [
      { kind: "Note", note: "Late call.", occurredAt: "2026-08-19T22:30:00Z" },
    ]);

    await page.goto(`/applications/${APPLICATION_ID}`);

    await expect(feed(page)).toContainText("20 Aug 2026, 08:30");
  });

  test("says so when there is nothing recorded", async ({ page }) => {
    await openWithHistory(page, []);

    await expect(panel(page)).toContainText("Nothing recorded yet.");
  });

  test("walks the rest of the history without putting the cursor in the URL", async ({ page }) => {
    // Past one page, so there is a second to ask for.
    const entries = Array.from({ length: 30 }, (_, index) => ({
      kind: "Note",
      note: `Entry ${String(index)}`,
      occurredAt: `2026-08-${String(index + 1).padStart(2, "0")}T09:00:00Z`,
    }));

    await openWithHistory(page, entries);

    // Newest first, so the last seeded entry heads the feed and the first is off
    // the end of page one.
    await expect(feed(page)).toContainText("Entry 29");
    await expect(feed(page)).not.toContainText("Entry 0");

    await page.getByRole("button", { name: "Load more" }).click();

    await expect(feed(page)).toContainText("Entry 0");
    // A cursor is a position in a walk rather than a page number, and a link to
    // one means nothing to anybody whose list has moved since.
    await expect(page).toHaveURL(`/applications/${APPLICATION_ID}`);
  });
});

test.describe("the note composer", () => {
  test("puts a submitted note at the head without a reload", async ({ page }) => {
    await openWithHistory(page, HISTORY);

    await page.getByLabel("Add a note").fill("Sent a thank-you email.");
    await page.getByRole("button", { name: "Add note" }).click();

    await expect(feed(page)).toContainText("Sent a thank-you email.");
    // Cleared, because the intent is spent - the next note is a new one.
    await expect(page.getByLabel("Add a note")).toHaveValue("");
  });

  test("sends an idempotency key and reuses it on a retry", async ({ page }) => {
    const email = await openWithHistory(page, HISTORY);

    await failCalls(email, ["add-note"]);

    await page.getByLabel("Add a note").fill("Sent a thank-you email.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("That note has not been saved. Try again.")).toBeVisible();

    // The same text, so the same intent - and re-issuing the key is what makes
    // one note one note however many attempts it took.
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(feed(page)).toContainText("Sent a thank-you email.");

    const keys = await idempotencyKeys(email);

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  test("mints a new key once the note has been edited", async ({ page }) => {
    // A key belongs to its payload: the API fingerprints the body, so the same
    // key over edited text is refused as a reused key rather than replayed.
    const email = await openWithHistory(page, HISTORY);

    await failCalls(email, ["add-note"]);

    await page.getByLabel("Add a note").fill("First wording.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("That note has not been saved. Try again.")).toBeVisible();

    await page.getByLabel("Add a note").fill("Second wording.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(feed(page)).toContainText("Second wording.");

    const keys = await idempotencyKeys(email);

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  test("shows the API's refusal against the field", async ({ page }) => {
    await openWithHistory(page, HISTORY);

    // Over the API's cap. The textarea deliberately does not enforce it, so the
    // rule is stated in one place and the user is told rather than truncated.
    await page.getByLabel("Add a note").fill("x".repeat(2001));
    await page.getByRole("button", { name: "Add note" }).click();

    await expect(page.getByText("The note must be 2000 characters or fewer.")).toBeVisible();
    // Kept, so the correction is an edit rather than a retype.
    await expect(page.getByLabel("Add a note")).not.toHaveValue("");
  });

  test("guards an empty note without a round trip", async ({ page }) => {
    await openWithHistory(page, HISTORY);

    await page.getByLabel("Add a note").fill("   ");

    await expect(page.getByRole("button", { name: "Add note" })).toBeDisabled();
  });
});
