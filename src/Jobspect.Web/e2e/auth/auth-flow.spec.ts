import { expect, test } from "@playwright/test";

import {
  anEmail,
  hashSid,
  redisClient,
  registerThroughTheForm,
  seedAccount,
  sessionCookie,
  signedInAs,
  signInThroughTheForm,
} from "./support";

// The flow Sprint 3 shipped with no automated coverage, driven against a real
// Redis and a process answering as the API. Everything below the browser is the
// production code: the Server Actions, the session store, the cookie and the
// DAL. Only the API is a stand-in.

test.describe("registering", () => {
  test("signs the account in and lands on the applications screen", async ({ page, context }) => {
    const email = anEmail();

    await registerThroughTheForm(page, email);

    // Rendering the address proves more than the redirect does: the shell calls
    // getAccount through the DAL, so the account it names came back from a
    // request the fake API accepted a bearer token for.
    await expect(signedInAs(page, email)).toBeVisible();

    const cookie = await sessionCookie(context);

    // The __Host- prefix is a contract with the browser rather than a naming
    // convention: it is refused outright unless all three of these hold, and the
    // absent Domain is the one that stops a sibling subdomain writing a cookie
    // this service would read.
    expect(cookie, "the response set a session cookie").toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
  });

  test("survives a reload", async ({ page }) => {
    const email = anEmail();
    await registerThroughTheForm(page, email);

    await page.reload();

    // A second request, so the cookie made the round trip and the record behind
    // it resolved out of Redis rather than out of anything in memory.
    await expect(page).toHaveURL(/\/applications$/);
    await expect(signedInAs(page, email)).toBeVisible();
  });
});

test.describe("signing out", () => {
  test("clears the cookie and the record behind it", async ({ page, context }) => {
    await registerThroughTheForm(page, anEmail());

    const before = await sessionCookie(context);
    expect(before, "there is a session to end").toBeDefined();
    const sid = before?.value ?? "";

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    expect(await sessionCookie(context)).toBeUndefined();

    // The half a cookie assertion cannot see. A logout that clears the browser
    // and leaves the record behind is a session anyone holding the old id could
    // still use.
    const redis = redisClient();
    try {
      expect(await redis.exists(`web:sess:${hashSid(sid)}`)).toBe(0);
    } finally {
      await redis.quit();
    }
  });

  test("leaves the guarded screens refusing to render", async ({ page }) => {
    await registerThroughTheForm(page, anEmail());
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/applications");

    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("signing in", () => {
  test("opens a session for an account that already exists", async ({ page, context }) => {
    const email = anEmail();
    // Seeded rather than registered, so this says nothing about the register
    // form and fails for one reason only.
    await seedAccount(email);

    await signInThroughTheForm(page, email);

    await expect(page).toHaveURL(/\/applications$/);
    await expect(signedInAs(page, email)).toBeVisible();
    expect(await sessionCookie(context)).toBeDefined();
  });
});
