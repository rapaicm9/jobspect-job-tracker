import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  failReads,
  registerThroughTheForm,
  seedAccount,
  seedApplications,
  seedCampaign,
  seedContacts,
  seedCustomFields,
  seedInterviews,
  signInThroughTheForm,
} from "./support";

// The first screen that reads more than one endpoint, and the first that can
// lose part of itself without losing the page.

const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";
const TEXT_FIELD = "22222222-2222-4222-8222-222222222222";
const ARCHIVED_FIELD = "33333333-3333-4333-8333-333333333333";

const APPLICATION = {
  id: APPLICATION_ID,
  role: "Frontend Engineer",
  companyName: "Acme",
  stage: "Interview",
  appliedDate: "2026-08-01",
  applicationDeadline: "2026-08-20",
  source: "LinkedIn",
  compensation: { amount: 65000, currency: "GBP" },
  location: "London",
  workMode: "Hybrid",
  postingUrl: "https://acme.test/jobs/1",
  cvLabel: "CV v3",
  createdAt: "2026-08-01T09:30:00Z",
  customFields: { [TEXT_FIELD]: "Series B", [ARCHIVED_FIELD]: 3 },
};

const FIELDS = [
  { id: TEXT_FIELD, label: "Funding stage", type: "Text" },
  { id: ARCHIVED_FIELD, label: "Headcount", type: "Number", isArchived: true },
];

/** Registers, seeds one application, and opens it directly. */
async function openTheDetail(page: Page): Promise<string> {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, [APPLICATION]);
  await seedCustomFields(email, FIELDS);
  await page.goto(`/applications/${APPLICATION_ID}`);

  return email;
}

test.describe("the application detail", () => {
  test("opens from the list and carries the campaign scope with it", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);

    const campaignId = await seedCampaign(email, "Grad scheme");
    await seedApplications(email, [{ ...APPLICATION, campaignId }]);

    await page.goto(`/applications?campaignId=${campaignId}`);
    await page.getByRole("link", { name: "Frontend Engineer" }).click();

    // Both halves matter: the id, so the link went where it said, and the scope,
    // because a link that drops it reverts the whole shell to the default
    // campaign on the way back.
    await expect(page).toHaveURL(`/applications/${APPLICATION_ID}?campaignId=${campaignId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Frontend Engineer" })).toBeVisible();
  });

  test("names the application, its company and its stage in the header", async ({ page }) => {
    await openTheDetail(page);

    const header = page.getByRole("heading", { level: 1, name: "Frontend Engineer" });
    await expect(header).toBeVisible();

    await expect(page.getByRole("main")).toContainText("Acme");
    await expect(page.getByRole("main")).toContainText("Interview");
  });

  test("renders every fact the API sent, formatted", async ({ page }) => {
    await openTheDetail(page);

    const main = page.getByRole("main");

    await expect(main).toContainText("1 Aug 2026");
    await expect(main).toContainText("20 Aug 2026");
    await expect(main).toContainText("LinkedIn");
    await expect(main).toContainText("£65,000");
    await expect(main).toContainText("London");
    await expect(main).toContainText("Hybrid");
    await expect(main).toContainText("CV v3");

    await expect(main.getByRole("link", { name: "https://acme.test/jobs/1" })).toHaveAttribute(
      "href",
      "https://acme.test/jobs/1",
    );
  });

  test("keeps the machine-readable date beside the rendered one", async ({ page }) => {
    await openTheDetail(page);

    await expect(page.getByRole("main").locator('time[datetime="2026-08-01"]')).toBeVisible();
  });

  test("labels custom-field answers, archived definitions included", async ({ page }) => {
    // On a Free account, which is the point: defining a field is the paid
    // capability and reading the answers back is not, so an account that never
    // had the entitlement - or has lost it - still sees what it recorded.
    await openTheDetail(page);

    const fields = page.getByRole("main").filter({ hasText: "Your fields" });

    await expect(fields).toContainText("Funding stage");
    await expect(fields).toContainText("Series B");

    // Archiving retires a field from new applications; the answer already given
    // still has to mean something.
    await expect(fields).toContainText("Headcount");
    await expect(fields).toContainText("(archived)");
    await expect(fields).toContainText("3");
  });

  test("renders an interview in the account's zone rather than the browser's", async ({ page }) => {
    const email = anEmail();

    // Seeded rather than registered, because the register form sends no zone and
    // the API defaults it - so an account made through the UI is always UTC and
    // this assertion would pass however the instant was formatted.
    await seedAccount(email, "Australia/Sydney");
    await signInThroughTheForm(page, email);
    await expect(page).toHaveURL(/\/applications$/, { timeout: 15_000 });

    await seedApplications(email, [APPLICATION]);
    await seedInterviews(email, APPLICATION_ID, [
      { scheduledAt: "2026-08-19T22:30:00Z", type: "Technical", format: "Remote" },
    ]);

    await page.goto(`/applications/${APPLICATION_ID}`);

    // 22:30 UTC on the 19th is 08:30 the next morning in Sydney. A browser-zone
    // render would show the day before and disagree with every reminder the
    // backend computes from the same field.
    await expect(page.getByRole("main")).toContainText("20 Aug 2026, 08:30");
    await expect(page.getByRole("main")).toContainText("Technical");
  });

  test("lists the contacts recorded against it", async ({ page }) => {
    const email = await openTheDetail(page);

    await seedContacts(email, APPLICATION_ID, [
      { name: "Dana Whitfield", role: "HiringManager", email: "dana@acme.test" },
    ]);

    await page.reload();

    const main = page.getByRole("main");
    await expect(main).toContainText("Dana Whitfield");
    // Two words to a reader where the API says one.
    await expect(main).toContainText("Hiring manager");
    await expect(main.getByRole("link", { name: "dana@acme.test" })).toHaveAttribute(
      "href",
      "mailto:dana@acme.test",
    );
  });

  test("says an application is absent rather than forbidden", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);

    // Another account's application answers 404 exactly as a deleted one does,
    // on both sides of the wire, so this screen cannot claim to know which.
    await page.goto("/applications/44444444-4444-4444-8444-444444444444");

    await expect(page.getByText("We could not find that application")).toBeVisible();
    await expect(page.getByText(/permission|forbidden|not allowed/i)).toHaveCount(0);

    // The shell survives it, which is why this route has a not-found of its own.
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("loses one panel rather than the page when a context read fails", async ({ page }) => {
    const email = await openTheDetail(page);

    await failReads(email, ["contacts"]);
    await page.reload();

    await expect(page.getByText("Contacts could not be loaded.")).toBeVisible();

    // Everything the reader came for is still on the screen. A page-level failure
    // here would report one missing panel by hiding eight facts.
    await expect(page.getByRole("heading", { level: 1, name: "Frontend Engineer" })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("£65,000");
    await expect(page.getByRole("main")).toContainText("Funding stage");
  });
});
