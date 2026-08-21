import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  anEmail,
  failCalls,
  idempotencyKeys,
  lastContactWriteBody,
  registerThroughTheForm,
  seedApplications,
  seedContacts,
} from "./support";

// The second panel to gain a write, and the one where a full replace can lose
// something invisible: a contact carries an application and a company that
// nothing on this screen renders, so dropping either leaves the panel looking
// exactly as it did.

const APPLICATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTACT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COMPANY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const APPLICATION = {
  id: APPLICATION_ID,
  role: "Frontend Engineer",
  companyName: "Acme",
  stage: "Interview",
  appliedDate: "2026-08-01",
};

const CONTACT = {
  id: CONTACT_ID,
  companyId: COMPANY_ID,
  name: "Dana Whitfield",
  role: "HiringManager",
  email: "dana@acme.test",
  phone: "+44 20 7946 0000",
  notes: "Met at the meetup.",
};

/** The panel's own list, named so an assertion cannot be answered by the form. */
function contacts(page: Page) {
  return page.getByRole("list", { name: "Contacts" });
}

/** Base UI commits a select on the pointer, so the option is clicked rather than filled. */
async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}

async function openTheApplication(page: Page, people: Record<string, unknown>[] = []) {
  const email = anEmail();
  await registerThroughTheForm(page, email);
  await seedApplications(email, [APPLICATION]);
  if (people.length > 0) await seedContacts(email, APPLICATION_ID, people);

  await page.goto(`/applications/${APPLICATION_ID}`);
  await expect(page.getByRole("heading", { name: /Frontend Engineer/ })).toBeVisible();

  return email;
}

test.describe("recording a contact", () => {
  test("adds one to a panel that had none", async ({ page }) => {
    const email = await openTheApplication(page);
    await expect(page.getByText("None recorded.")).toBeVisible();

    await page.getByRole("button", { name: "Add contact" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Sam Okafor");
    await choose(page, "Role", "Recruiter");
    await dialog.getByLabel("Email").fill("sam@acme.test");
    await dialog.getByRole("button", { name: "Add contact" }).click();

    await expect(dialog).toBeHidden();
    await expect(contacts(page)).toContainText("Sam Okafor");
    await expect(contacts(page)).toContainText("Recruiter");
    await expect(contacts(page)).toContainText("sam@acme.test");

    // Linked to this application and to no company: the panel records the people
    // on an application, and a company id copied from it would be the wrong one
    // as soon as somebody retyped the company name.
    expect(await lastContactWriteBody(email)).toMatchObject({
      applicationId: APPLICATION_ID,
      companyId: null,
    });
  });

  test("insists on a name, before a request is made", async ({ page }) => {
    const email = await openTheApplication(page);
    await page.getByRole("button", { name: "Add contact" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Add contact" }).click();

    await expect(dialog.getByText("A name is required.")).toBeVisible();
    expect(await lastContactWriteBody(email)).toBeNull();
  });

  test("leaves the role unanswered when nobody chose one", async ({ page }) => {
    const email = await openTheApplication(page);
    await page.getByRole("button", { name: "Add contact" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Sam Okafor");
    await dialog.getByRole("button", { name: "Add contact" }).click();
    await expect(dialog).toBeHidden();

    // Genuinely optional, unlike an interview's type: not knowing yet whether
    // somebody is the recruiter or the hiring manager is an ordinary state of a
    // search, so the select keeps its "Not set" item and this goes out as null.
    expect(await lastContactWriteBody(email)).toMatchObject({ role: null });
  });
});

test.describe("editing a contact", () => {
  test("hydrates every field from the person it is editing", async ({ page }) => {
    await openTheApplication(page, [CONTACT]);

    await page.getByRole("button", { name: "Edit Dana Whitfield" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Name")).toHaveValue("Dana Whitfield");
    await expect(dialog.getByLabel("Role")).toContainText("Hiring manager");
    await expect(dialog.getByLabel("Email")).toHaveValue("dana@acme.test");
    await expect(dialog.getByLabel("Phone")).toHaveValue("+44 20 7946 0000");
    await expect(dialog.getByLabel("Notes")).toHaveValue("Met at the meetup.");
  });

  test("changes one field and sends every other one back unchanged", async ({ page }) => {
    const email = await openTheApplication(page, [CONTACT]);

    await page.getByRole("button", { name: "Edit Dana Whitfield" }).click();
    await choose(page, "Role", "Interviewer");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(contacts(page)).toContainText("Interviewer");

    // The assertion the screen cannot make. Both links ride along on every
    // replace and neither is rendered, so a mapper that dropped one would look
    // perfectly fine here and quietly detach the contact.
    expect(await lastContactWriteBody(email)).toEqual({
      applicationId: APPLICATION_ID,
      companyId: COMPANY_ID,
      name: "Dana Whitfield",
      role: "Interviewer",
      email: "dana@acme.test",
      phone: "+44 20 7946 0000",
      notes: "Met at the meetup.",
    });
  });

  test("clears a field the user actually emptied", async ({ page }) => {
    const email = await openTheApplication(page, [CONTACT]);

    await page.getByRole("button", { name: "Edit Dana Whitfield" }).click();
    await page.getByRole("dialog").getByLabel("Phone").fill("");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    expect(await lastContactWriteBody(email)).toMatchObject({ phone: null });
  });

  test("offers no way to delete a contact", async ({ page }) => {
    await openTheApplication(page, [CONTACT]);

    // There is no DELETE on this resource, so the panel must never grow one.
    // Scoped to the panel rather than the page: the application itself now has
    // a delete in the header, and a page-wide count would read that as this
    // panel growing one.
    await expect(
      page.getByRole("list", { name: "Contacts" }).getByRole("button", { name: /delete|remove/i }),
    ).toHaveCount(0);
  });
});

test.describe("the idempotency key", () => {
  test("is reused on a retry and minted afresh for an edited contact", async ({ page }) => {
    const email = await openTheApplication(page);

    const add = async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Add contact" }).click();
    };

    await failCalls(email, ["create-contact"]);
    await page.getByRole("button", { name: "Add contact" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Sam Okafor");

    await add();
    await expect(dialog.getByText(/has not been saved/)).toBeVisible();

    // The same intent, so the same key: a POST applied twice is two people, and
    // the header is the only thing standing between a retry and a duplicate.
    await add();
    await expect(dialog).toBeHidden();

    const [first, second] = await idempotencyKeys(email);
    expect(second, "a retry of one contact reuses its key").toBe(first);

    // A changed payload is a different intent, which the API refuses under a key
    // it has already fingerprinted.
    await failCalls(email, ["create-contact"]);
    await page.getByRole("button", { name: "Add contact" }).click();
    await dialog.getByLabel("Name").fill("Alex Reyes");

    await add();
    await expect(dialog.getByText(/has not been saved/)).toBeVisible();

    await dialog.getByLabel("Email").fill("alex@acme.test");
    await add();
    await expect(dialog).toBeHidden();

    const keys = await idempotencyKeys(email);
    expect(keys.at(-1), "an edited contact is a new intent").not.toBe(keys.at(-2));
  });
});

test.describe("when the API refuses", () => {
  test("puts a message the server keyed to a field on that field", async ({ page }) => {
    await openTheApplication(page, [CONTACT]);

    await page.getByRole("button", { name: "Edit Dana Whitfield" }).click();

    const dialog = page.getByRole("dialog");

    // The client deliberately does not restate the email rule: the form is
    // noValidate and the server writes the sentence worth showing.
    await dialog.getByLabel("Email").fill("dana at acme");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(dialog.getByText("The email address is not valid.")).toBeVisible();
  });

  test("offers nothing to add against a panel that could not be read", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);
    await seedApplications(email, [APPLICATION]);
    await failCalls(email, ["contacts"]);

    await page.goto(`/applications/${APPLICATION_ID}`);

    await expect(page.getByText("Contacts could not be loaded.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add contact" })).toHaveCount(0);
  });
});

test.describe("accessibility", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`the open dialog has no violations in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openTheApplication(page, [CONTACT]);

      // Its own sweep rather than part of the detail screen's: a modal dialog
      // hides the page behind it, so one sweep can see the screen or the dialog
      // and never both.
      await page.getByRole("button", { name: "Edit Dana Whitfield" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
