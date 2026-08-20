import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  anEmail,
  dragCardToCloseOut,
  liftCardWithKeyboard,
  openPalette,
  openTransitionMenu,
  registerThroughTheForm,
  seedActivity,
  seedApplications,
  seedContacts,
  seedCustomFields,
  seedInterviews,
} from "./support";

/**
 * Repeated rather than imported from `enums.ts`, which opens with
 * `import 'server-only'` and throws outside a bundler. The canonical list is
 * already held to the contract by the enum agreement suite, so what is repeated
 * here is a fixture rather than a second source of truth.
 */
const STAGES = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Accepted",
  "Rejected",
  "Withdrawn",
  "Ghosted",
];

// The signed-in half of the product, which e2e/a11y.spec.ts cannot reach: those
// routes redirect to /login without a session, so until this stack existed the
// gate only ever saw the marketing pages.

const ROUTES = ["/board", "/applications", "/analytics", "/reminders", "/settings"];

// The detail route needs an id, so it cannot join the list above. Fixed rather
// than generated, so the seed and the address agree.
const DETAIL_ID = "55555555-5555-4555-8555-555555555555";
const DETAIL_FIELD = "66666666-6666-4666-8666-666666666666";

// target-size (2.5.8) is off unless the WCAG 2.2 ruleset is asked for by name.
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Both themes, but only here. The ordinary suite runs its whole file twice
// because every spec in it is about colour; the session specs beside this one
// would only sign in twice to prove the same thing, so the theme is scoped to
// the sweep that reads it rather than to a second project.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the command palette has none while it is open", async ({ page }) => {
      await registerThroughTheForm(page, anEmail());

      await openPalette(page);

      // A dialog over a combobox is the most accessibility-sensitive thing on
      // this screen, and a sweep with it closed would never see any of it.
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

      expect(
        violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
        "axe found violations with the palette open",
      ).toEqual([]);
    });

    test("the board has none with a card lifted", async ({ page }) => {
      // A lifted card carries aria-pressed, aria-grabbed and aria-roledescription
      // that only exist while a drag is live, and the close-out zone only exists
      // then at all - so a sweep of the board at rest judges none of it.
      const email = anEmail();
      await registerThroughTheForm(page, email);
      await seedApplications(email, [
        { stage: "Applied", role: "Frontend Engineer", companyName: "Acme" },
      ]);
      await page.goto("/board");

      await liftCardWithKeyboard(page, "Frontend Engineer");

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

      expect(
        violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
        "axe found violations with a card lifted",
      ).toEqual([]);
    });

    test("the board's outcome picker has none while it is open", async ({ page }) => {
      // A dialog with no trigger, opened by a drop and reached by no other route,
      // so a sweep of the board at rest never sees any of it.
      const email = anEmail();
      await registerThroughTheForm(page, email);
      await seedApplications(email, [
        { stage: "Offer", role: "Frontend Engineer", companyName: "Acme" },
      ]);
      await page.goto("/board");

      await dragCardToCloseOut(page, "Frontend Engineer");

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

      expect(
        violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
        "axe found violations with the outcome picker open",
      ).toEqual([]);
    });

    test("the shell has no accessibility violations on any destination", async ({ page }) => {
      const email = anEmail();
      await registerThroughTheForm(page, email);

      // One row per stage, so the sweep judges every chip treatment rather than
      // an empty table. The eight surface/foreground pairs exist because no
      // single value cleared both contrast floors, and this is what checks that
      // they still do - in both themes, which is where it went wrong before.
      await seedApplications(
        email,
        STAGES.map((stage, index) => ({
          stage,
          role: `Engineer ${String(index)}`,
          companyName: "Acme",
          source: "LinkedIn",
          compensation: { amount: 65000, currency: "GBP" },
          location: "London",
          workMode: "Hybrid",
          applicationDeadline: "2026-09-01",
        })),
      );

      // One session across the five routes: signing in per route would be five
      // registrations to sweep one header.
      for (const route of ROUTES) {
        await page.goto(route);

        const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

        expect(
          violations.map((v) => `${route} ${v.id} (${v.nodes.length}): ${v.help}`),
          `axe found violations on ${route}`,
        ).toEqual([]);
      }
    });

    test("the not-found page has none with a session", async ({ page }) => {
      // Signed in it renders a different set of controls from the signed-out
      // version e2e/a11y.spec.ts sweeps - two links and a sign-out form rather
      // than one link - and it is the screen a reader reaches already stuck, so
      // it is the last place a violation should be waiting.
      await registerThroughTheForm(page, anEmail());

      await page.goto("/no-such-page");

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

      expect(
        violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
        "axe found violations on the not-found page",
      ).toEqual([]);
    });

    test("the application detail has none with every panel populated", async ({ page }) => {
      const email = anEmail();
      await registerThroughTheForm(page, email);

      // Every region filled, because an empty panel sweeps nothing: the contrast
      // of a chip, a link inside a definition list and a rendered instant are all
      // things only a populated screen has.
      await seedCustomFields(email, [{ id: DETAIL_FIELD, label: "Funding stage", type: "Text" }]);
      await seedApplications(email, [
        {
          id: DETAIL_ID,
          role: "Frontend Engineer",
          companyName: "Acme",
          stage: "Offer",
          appliedDate: "2026-08-01",
          applicationDeadline: "2026-09-01",
          offerDecisionDeadline: "2026-09-10",
          source: "LinkedIn",
          compensation: { amount: 65000, currency: "GBP" },
          location: "London",
          workMode: "Hybrid",
          postingUrl: "https://acme.test/jobs/1",
          cvLabel: "CV v3",
          customFields: { [DETAIL_FIELD]: "Series B" },
        },
      ]);
      await seedContacts(email, DETAIL_ID, [
        { name: "Dana Whitfield", role: "HiringManager", email: "dana@acme.test" },
      ]);
      await seedInterviews(email, DETAIL_ID, [
        { scheduledAt: "2026-08-20T09:00:00Z", type: "Technical", format: "Remote" },
      ]);
      // The timeline carries chips on a different surface from the table's, and
      // the composer is the only labelled field on the screen.
      await seedActivity(email, DETAIL_ID, [
        { kind: "Created", toStage: "Applied", occurredAt: "2026-08-01T09:00:00Z" },
        {
          kind: "StageChanged",
          fromStage: "Applied",
          toStage: "Offer",
          transitionKind: "Advance",
          occurredAt: "2026-08-03T09:00:00Z",
        },
        { kind: "Note", note: "Recruiter called.", occurredAt: "2026-08-05T09:00:00Z" },
      ]);

      await page.goto(`/applications/${DETAIL_ID}`);

      // Open, because a closed menu sweeps nothing and a menu over a header is
      // the most accessibility-sensitive thing on this screen.
      await openTransitionMenu(page);

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();

      expect(
        violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`),
        "axe found violations on the application detail",
      ).toEqual([]);
    });
  });
}
