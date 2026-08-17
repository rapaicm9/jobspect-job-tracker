import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  failCalls,
  idempotencyKeys,
  lastInterviewWriteBody,
  registerThroughTheForm,
  seedAccount,
  seedApplications,
  seedInterviews,
  signInThroughTheForm,
} from "./support";

// The first write on this client whose key field is an instant rather than a
// date, and the second full replace - so the two things worth proving here are
// that a wall clock is placed in the account's zone and that an edit of one field
// sends the other four back as they were.

const APPLICATION_ID = "99999999-9999-4999-8999-999999999999";
const INTERVIEW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const APPLICATION = {
  id: APPLICATION_ID,
  role: "Frontend Engineer",
  companyName: "Acme",
  stage: "Interview",
  appliedDate: "2026-08-01",
};

const INTERVIEW = {
  id: INTERVIEW_ID,
  scheduledAt: "2026-08-20T09:00:00Z",
  type: "Technical",
  format: "Remote",
  outcome: "Pending",
  notes: "Bring the take-home.",
};

/** The panel's own list, named so an assertion cannot be answered by the form. */
function interviews(page: Page) {
  return page.getByRole("list", { name: "Interviews" });
}

/** Base UI commits a select on the pointer, so the option is clicked rather than filled. */
async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}

async function openTheApplication(page: Page, rounds: Record<string, unknown>[] = []) {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, [APPLICATION]);
  if (rounds.length > 0) await seedInterviews(email, APPLICATION_ID, rounds);

  await page.goto(`/applications/${APPLICATION_ID}`);
  await expect(page.getByRole("heading", { name: /Frontend Engineer/ })).toBeVisible();

  return email;
}

test.describe("scheduling a round", () => {
  test("adds one to a panel that had none", async ({ page }) => {
    await openTheApplication(page);
    await expect(page.getByText("None scheduled.")).toBeVisible();

    await page.getByRole("button", { name: "Add interview" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("When").fill("2026-09-01T14:30");
    await choose(page, "Type", "Phone screen");
    await choose(page, "Format", "Remote");
    await dialog.getByLabel("Notes").fill("Thirty minutes with the recruiter.");
    await dialog.getByRole("button", { name: "Add interview" }).click();

    // The panel is server rendered and the action invalidates the route, so the
    // refreshed tree arrives with the action's own response.
    await expect(dialog).toBeHidden();
    await expect(interviews(page)).toContainText("1 Sept 2026, 14:30");
    await expect(interviews(page)).toContainText("Phone screen · Remote · Pending");
    await expect(interviews(page)).toContainText("Thirty minutes with the recruiter.");
  });

  test("offers no outcome, because a new round is always pending", async ({ page }) => {
    await openTheApplication(page);
    await page.getByRole("button", { name: "Add interview" }).click();

    // The endpoint has no such field. A control here would be a question whose
    // answer is thrown away.
    await expect(page.getByRole("dialog").getByLabel("Outcome")).toBeHidden();
  });

  test("insists on the fields the API insists on, before a request is made", async ({ page }) => {
    const email = await openTheApplication(page);
    await page.getByRole("button", { name: "Add interview" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Add interview" }).click();

    await expect(dialog.getByText("A date and time is required.")).toBeVisible();
    await expect(dialog.getByText("Choose what kind of round this is.")).toBeVisible();
    await expect(dialog.getByText("Choose how the round is held.")).toBeVisible();

    expect(await lastInterviewWriteBody(email)).toBeNull();
  });
});

test.describe("editing a round", () => {
  test("hydrates every field from the round it is editing", async ({ page }) => {
    await openTheApplication(page, [INTERVIEW]);

    await page.getByRole("button", { name: /^Edit interview on/ }).click();

    const dialog = page.getByRole("dialog");

    // The instant as a wall clock, which is what the control binds to and the
    // only form the user can reason about.
    await expect(dialog.getByLabel("When")).toHaveValue("2026-08-20T09:00");
    await expect(dialog.getByLabel("Type")).toContainText("Technical");
    await expect(dialog.getByLabel("Format")).toContainText("Remote");
    await expect(dialog.getByLabel("Outcome")).toContainText("Pending");
    await expect(dialog.getByLabel("Notes")).toHaveValue("Bring the take-home.");
  });

  test("records how a round went and sends every other field back unchanged", async ({ page }) => {
    const email = await openTheApplication(page, [INTERVIEW]);

    await page.getByRole("button", { name: /^Edit interview on/ }).click();
    await choose(page, "Outcome", "Passed");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(interviews(page)).toContainText("Technical · Remote · Passed");

    // The assertion that matters, and the screen cannot make it: a replace turns
    // an omission into a deletion, and the notes on a round nobody touched are
    // what goes first.
    expect(await lastInterviewWriteBody(email)).toEqual({
      scheduledAt: "2026-08-20T09:00:00.000Z",
      type: "Technical",
      format: "Remote",
      outcome: "Passed",
      notes: "Bring the take-home.",
    });
  });

  test("clears the notes only when they were actually cleared", async ({ page }) => {
    const email = await openTheApplication(page, [INTERVIEW]);

    await page.getByRole("button", { name: /^Edit interview on/ }).click();
    await page.getByRole("dialog").getByLabel("Notes").fill("");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // Null rather than "", which the API would store as a note consisting of
    // nothing.
    expect(await lastInterviewWriteBody(email)).toMatchObject({ notes: null });
  });

  test("offers no way to delete a round", async ({ page }) => {
    await openTheApplication(page, [INTERVIEW]);

    // There is no DELETE on this resource. Calling a round off is an outcome of
    // Cancelled, which is also what retracts its reminders.
    await expect(page.getByRole("button", { name: /delete|remove|cancel round/i })).toHaveCount(0);
    await page.getByRole("button", { name: /^Edit interview on/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Cancelled is how a round is called off");
  });
});

test.describe("the account's timezone", () => {
  test("is what a typed time is placed in, and read back in", async ({ page }) => {
    const email = anEmail();

    // Seeded rather than registered, because the register form sends no zone and
    // the API defaults it - so an account made through the UI is always UTC and
    // this assertion would pass however the time was converted. Adelaide is half
    // an hour off the hour, which a whole-hour mistake cannot fake.
    await seedAccount(email, "Australia/Adelaide");
    await signInThroughTheForm(page, email);
    await expect(page).toHaveURL(/\/applications$/, { timeout: 15_000 });

    await seedApplications(email, [APPLICATION]);
    await page.goto(`/applications/${APPLICATION_ID}`);

    await page.getByRole("button", { name: "Add interview" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("In Australia/Adelaide, your account's timezone.");

    await dialog.getByLabel("When").fill("2026-09-01T09:00");
    await choose(page, "Type", "On-site");
    await choose(page, "Format", "On-site");
    await dialog.getByRole("button", { name: "Add interview" }).click();
    await expect(dialog).toBeHidden();

    // 09:00 in Adelaide is 23:30 the evening before in UTC. The browser running
    // this spec is in neither zone, which is the point.
    expect(await lastInterviewWriteBody(email)).toMatchObject({
      scheduledAt: "2026-08-31T23:30:00.000Z",
    });

    await expect(interviews(page)).toContainText("1 Sept 2026, 09:00");
  });
});

test.describe("the idempotency key", () => {
  test("is reused on a retry and minted afresh for an edited round", async ({ page }) => {
    const email = await openTheApplication(page);

    const schedule = async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Add interview" }).click();
    };

    await failCalls(email, ["create-interview"]);
    await page.getByRole("button", { name: "Add interview" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("When").fill("2026-09-01T14:30");
    await choose(page, "Type", "Technical");
    await choose(page, "Format", "Remote");

    await schedule();
    await expect(dialog.getByText(/has not been saved/)).toBeVisible();

    // The same intent, so the same key: a POST applied twice is two rounds, and
    // the header is the only thing standing between a retry and a duplicate.
    await schedule();
    await expect(dialog).toBeHidden();

    const [first, second] = await idempotencyKeys(email);
    expect(second, "a retry of one round reuses its key").toBe(first);

    // A changed payload is a different intent. Reusing the key there is refused
    // as `idempotency.key_reused`, correctly.
    await failCalls(email, ["create-interview"]);
    await page.getByRole("button", { name: "Add interview" }).click();
    await dialog.getByLabel("When").fill("2026-09-02T10:00");
    await choose(page, "Type", "On-site");
    await choose(page, "Format", "Phone");

    await schedule();
    await expect(dialog.getByText(/has not been saved/)).toBeVisible();

    await dialog.getByLabel("Notes").fill("Moved to the afternoon.");
    await schedule();
    await expect(dialog).toBeHidden();

    const keys = await idempotencyKeys(email);
    expect(keys.at(-1), "an edited round is a new intent").not.toBe(keys.at(-2));
  });
});

test.describe("when the API refuses", () => {
  test("puts a message the server keyed to a field on that field", async ({ page }) => {
    await openTheApplication(page, [INTERVIEW]);

    await page.getByRole("button", { name: /^Edit interview on/ }).click();

    const dialog = page.getByRole("dialog");

    // Over the API's cap, which the client deliberately does not restate: a hard
    // maxLength truncates a paste without saying so, and the server writes the
    // sentence worth showing.
    await dialog.getByLabel("Notes").fill("x".repeat(2001));
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(dialog.getByText("The notes must be 2000 characters or fewer.")).toBeVisible();
  });

  test("offers nothing to add against a panel that could not be read", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedApplications(email, [APPLICATION]);
    await failCalls(email, ["interviews"]);

    await page.goto(`/applications/${APPLICATION_ID}`);

    // The panel could not show the round afterwards either, so a write here would
    // look like it did nothing at all.
    await expect(page.getByText("Interviews could not be loaded.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add interview" })).toHaveCount(0);
  });
});

test.describe("accessibility", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`the open dialog has no violations in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openTheApplication(page, [INTERVIEW]);

      // Its own sweep rather than part of the detail screen's: a modal dialog
      // hides the page behind it, so one sweep can see the screen or the dialog
      // and never both.
      await page.getByRole("button", { name: /^Edit interview on/ }).click();
      await expect(page.getByRole("dialog")).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
