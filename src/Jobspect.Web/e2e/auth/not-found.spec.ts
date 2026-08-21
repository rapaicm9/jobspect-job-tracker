import { expect, test } from "@playwright/test";

import { anEmail, registerThroughTheForm, sessionCookie } from "./support";

// The 404 that could not be escaped, and the reason this file exists rather than
// a case appended to the a11y sweep.
//
// Reported once: a sign-in landed on a 404, and from there neither /login nor
// /register could be reached because both correctly bounce a live session back
// to the screen that was broken. Restarting the stack was the only way out. What
// produced the first 404 was never established; what is asserted here is that
// whatever produces one, the reader is not stuck behind it.

const NOWHERE = "/no-such-page";

test.describe("the not-found page", () => {
  test("answers 404 rather than a page that only looks wrong", async ({ page }) => {
    // Worth its own assertion because the failure it guards is silent: a
    // not-found rendering with a 200 looks identical to a reader and is a
    // different thing entirely to a crawler, a monitor or a fetch.
    const response = await page.goto(NOWHERE);

    expect(response?.status(), "the response status").toBe(404);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
  });

  test("offers a signed-in reader the way back into the product", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());

    await page.goto(NOWHERE);

    await expect(page.getByRole("link", { name: "Applications" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("signs the reader out from the dead end itself", async ({ page, context }) => {
    // The regression test for the trap. Every step is one the original report
    // could not take.
    await registerThroughTheForm(page, anEmail());
    await page.goto(NOWHERE);

    await page.getByRole("button", { name: "Sign out" }).click();

    // Landing on /login is half the assertion. The other half is that it renders
    // its form rather than bouncing back to the screen that was broken, which is
    // the loop that made this a trap rather than an inconvenience.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    expect(await sessionCookie(context), "the session cookie is gone").toBeUndefined();

    // And the session is genuinely over rather than the page having merely
    // navigated: a guarded screen now refuses to render.
    await page.goto("/applications");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("offers a visitor with no session the way in", async ({ page }) => {
    // No registration: the same URL, read by somebody who was never signed in.
    // Sign-out is withheld here and only here - offering it to a visitor who has
    // no session to end is an instruction that does nothing.
    await page.goto(NOWHERE);

    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden();
  });
});
