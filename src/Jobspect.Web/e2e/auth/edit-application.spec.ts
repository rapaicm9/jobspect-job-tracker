import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  lastUpdateBody,
  registerThroughTheForm,
  seedApplications,
  seedCustomFields,
  seedPlan,
} from "./support";

// The first form on this client, and the first write that can destroy data: a
// PUT here replaces, so a field the form forgets is a field the API clears.

const APPLICATION_ID = "44444444-4444-4444-8444-444444444444";
const TEXT_FIELD = "55555555-5555-4555-8555-555555555555";
const ARCHIVED_FIELD = "66666666-6666-4666-8666-666666666666";

/** Every field populated and distinct, so a value that moved is visible. */
const APPLICATION = {
  id: APPLICATION_ID,
  role: "Frontend Engineer",
  companyName: "Acme",
  companyId: "77777777-7777-4777-8777-777777777777",
  stage: "Interview",
  appliedDate: "2026-08-01",
  applicationDeadline: "2026-08-20",
  offerDecisionDeadline: "2026-09-05",
  source: "LinkedIn",
  compensation: { amount: 65000, currency: "GBP" },
  location: "London",
  workMode: "Hybrid",
  postingUrl: "https://acme.test/jobs/1",
  cvLabel: "CV v3",
  coverLetterLabel: "Letter v2",
  createdAt: "2026-08-01T09:30:00Z",
  customFields: { [TEXT_FIELD]: "Series B", [ARCHIVED_FIELD]: 3 },
};

const FIELDS = [
  { id: TEXT_FIELD, label: "Funding stage", type: "Text" },
  { id: ARCHIVED_FIELD, label: "Headcount", type: "Number", isArchived: true },
];

async function openTheEditor(page: Page, options: { tier?: "Free" | "Pro" } = {}): Promise<string> {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, [APPLICATION]);
  await seedCustomFields(email, FIELDS);
  if (options.tier !== undefined) await seedPlan(email, options.tier);

  await page.goto(`/applications/${APPLICATION_ID}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Role")).toHaveValue("Frontend Engineer");

  return email;
}

test.describe("editing an application", () => {
  test("hydrates every field from the application it is editing", async ({ page }) => {
    await openTheEditor(page);

    // There is no partial edit affordance anywhere here, so a field the form did
    // not hydrate is a field about to be sent as blank.
    await expect(page.getByLabel("Company")).toHaveValue("Acme");
    await expect(page.getByLabel("Applied")).toHaveValue("2026-08-01");
    await expect(page.getByLabel("Application deadline")).toHaveValue("2026-08-20");
    await expect(page.getByLabel("Location")).toHaveValue("London");
    await expect(page.getByLabel("Source")).toHaveValue("LinkedIn");
    await expect(page.getByLabel("CV")).toHaveValue("CV v3");
    await expect(page.getByLabel("Cover letter")).toHaveValue("Letter v2");
    await expect(page.getByLabel("Posting")).toHaveValue("https://acme.test/jobs/1");
    await expect(page.getByLabel("Amount")).toHaveValue("65000");
    await expect(page.getByLabel("Currency")).toHaveValue("GBP");
  });

  test("saves one field and sends every other one back unchanged", async ({ page }) => {
    const email = await openTheEditor(page);

    await page.getByLabel("Location").fill("Hamburg");
    await page.getByRole("button", { name: "Save changes" }).click();

    // Back to the read view, and the screen agrees.
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByText("Hamburg")).toBeVisible();

    // The assertion that matters, and the screen cannot make it: what went out.
    const body = await lastUpdateBody(email);

    expect(body).toMatchObject({
      role: "Frontend Engineer",
      location: "Hamburg",
      appliedDate: "2026-08-01",
      applicationDeadline: "2026-08-20",
      offerDecisionDeadline: "2026-09-05",
      source: "LinkedIn",
      compensation: { amount: 65000, currency: "GBP" },
      workMode: "Hybrid",
      postingUrl: "https://acme.test/jobs/1",
      cvLabel: "CV v3",
      coverLetterLabel: "Letter v2",
      // Untouched, so the company it already points at rather than a name to
      // resolve again.
      companyId: APPLICATION.companyId,
      companyName: null,
    });
  });

  test("sends a changed company as a name for the API to resolve", async ({ page }) => {
    const email = await openTheEditor(page);

    await page.getByLabel("Company").fill("Globex");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    expect(await lastUpdateBody(email)).toMatchObject({
      companyId: null,
      companyName: "Globex",
    });
  });

  test("clears a field the user actually emptied", async ({ page }) => {
    const email = await openTheEditor(page);

    await page.getByLabel("Location").fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    // Null, not "". A replace that could never clear anything would be safe and
    // useless, and the empty string is a value the API would store.
    expect(await lastUpdateBody(email)).toMatchObject({ location: null });
  });

  test("refuses to submit without a role, before a request is made", async ({ page }) => {
    const email = await openTheEditor(page);

    await page.getByLabel("Role").fill("");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("A role is required.")).toBeVisible();
    expect(await lastUpdateBody(email)).toBeNull();
  });
});

test.describe("the offer decision deadline", () => {
  test("is read-only while the application is not at Offer, and still round-trips", async ({
    page,
  }) => {
    const email = await openTheEditor(page);

    const field = page.getByLabel("Offer decision by");
    await expect(field).toHaveAttribute("readonly", "");
    await expect(field).toHaveValue("2026-09-05");

    await page.getByLabel("Location").fill("Hamburg");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    // Read-only rather than disabled, and this is why: react-hook-form drops a
    // disabled field from the submitted values, which against a replace means
    // the stored date is cleared.
    expect(await lastUpdateBody(email)).toMatchObject({ offerDecisionDeadline: "2026-09-05" });
  });

  test("is editable once the application is at Offer", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedApplications(email, [{ ...APPLICATION, stage: "Offer" }]);
    await page.goto(`/applications/${APPLICATION_ID}`);
    await page.getByRole("button", { name: "Edit" }).click();

    const field = page.getByLabel("Offer decision by");
    await expect(field).not.toHaveAttribute("readonly", "");

    await field.fill("2026-09-30");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    expect(await lastUpdateBody(email)).toMatchObject({ offerDecisionDeadline: "2026-09-30" });
  });
});

test.describe("the custom-field answers, which the form never shows", () => {
  test("are retained by an absent bag on a Free account", async ({ page }) => {
    const email = await openTheEditor(page, { tier: "Free" });

    await page.getByLabel("Location").fill("Hamburg");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    // Null retains for an account that may not write them. Anything non-null is
    // refused outright, so this is the only body that both saves the edit and
    // leaves the answers where they are.
    expect(await lastUpdateBody(email)).toMatchObject({ customFields: null });

    await expect(page.getByText("Series B")).toBeVisible();
  });

  test("are re-sent whole by a Pro account, minus anything archived", async ({ page }) => {
    const email = await openTheEditor(page, { tier: "Pro" });

    await page.getByLabel("Location").fill("Hamburg");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();

    // Null would clear them for an account that may write. The archived field is
    // dropped because the API refuses any write naming one - which would
    // otherwise refuse this whole edit over a field the form never showed.
    expect(await lastUpdateBody(email)).toMatchObject({
      customFields: { [TEXT_FIELD]: "Series B" },
    });

    await expect(page.getByText("Series B")).toBeVisible();
  });
});

test.describe("the source box", () => {
  test("offers what this account has already used", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedApplications(email, [
      APPLICATION,
      { id: "88888888-8888-4888-8888-888888888888", source: "Referral" },
    ]);

    await page.goto(`/applications/${APPLICATION_ID}`);
    await page.getByRole("button", { name: "Edit" }).click();

    const listId = await page.getByLabel("Source").getAttribute("list");
    expect(listId, "the source box is wired to a datalist").not.toBeNull();

    // An attribute selector rather than `#id`: the id is React-generated and
    // `CSS.escape` is a browser global the runner does not have.
    //
    // Free text with suggestions, not a set to choose from - so the assertion is
    // that both values are offered, not that the field is constrained to them.
    const options = page.locator(`datalist[id="${listId!}"] option`);
    await expect(options).toHaveCount(2);
    await expect(options.first()).toHaveAttribute("value", "LinkedIn");
  });
});

test.describe("accessibility", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`the open form has no violations in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openTheEditor(page);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
