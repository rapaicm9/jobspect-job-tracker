import { createHash, randomUUID } from "node:crypto";

import { expect, type BrowserContext, type Page } from "@playwright/test";
import Redis from "ioredis";

import { FAKE_API_ORIGIN, REDIS_PORT } from "../stack/ports";

export const SESSION_COOKIE = "__Host-jobspect.sid";

/** Meets the API's policy, so a spec never fails on the password rules. */
export const PASSWORD = "Passw0rd!23";

/** Unique per spec, so the suite can run its files in parallel against one API. */
export function anEmail(): string {
  return `${randomUUID()}@jobspect.test`;
}

/**
 * The same digest `src/server/session/store.ts` keys sessions by.
 *
 * Repeated rather than imported: everything under src/server/ opens with
 * `import 'server-only'`, which throws outside a bundler, so this file cannot
 * reach it. Two lines of duplication against a suite that could not otherwise
 * check the record was deleted.
 */
export function hashSid(sid: string): string {
  return createHash("sha256").update(sid).digest("hex");
}

export function redisClient(): Redis {
  return new Redis({ host: "127.0.0.1", port: REDIS_PORT, maxRetriesPerRequest: 1 });
}

/**
 * The account the shell header names.
 *
 * Worth asserting on rather than the URL alone: the header reads it through the
 * DAL, so seeing it means a request went out carrying a bearer token the API
 * accepted, not merely that a redirect landed.
 */
export function signedInAs(page: Page, email: string) {
  return page.getByRole("banner").getByText(email);
}

export async function sessionCookie(context: BrowserContext) {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === SESSION_COOKIE);
}

async function submitCredentials(page: Page, email: string, label: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: label }).click();
}

/** Registers through the real form, which is what mints a session. */
export async function registerThroughTheForm(page: Page, email: string): Promise<void> {
  await page.goto("/register");
  await submitCredentials(page, email, "Create account");

  // Longer than the default five seconds, because this one assertion waits on a
  // Server Action, a call to the API, a Redis write, a redirect and the render
  // of a screen that fetches its own first page. Every spec starts here, so when
  // the suite is under load this is where the budget runs out first - and a
  // genuine break still fails, only later.
  await expect(page).toHaveURL(/\/applications$/, { timeout: 15_000 });
}

export async function signInThroughTheForm(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await submitCredentials(page, email, "Sign in");
}

/**
 * Seeds a list for an account that already exists.
 *
 * The fake fills in every field the spec did not name, so a spec about columns
 * states only the values it asserts rather than a full DTO literal.
 */
export async function seedApplications(
  email: string,
  applications: Record<string, unknown>[],
): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, applications }),
  });

  expect(response.status, "the fake API seeded the applications").toBe(201);
}

/**
 * Arms the fake to answer the next cursored read as a stale cursor.
 *
 * The real API reaches that state when the order changes under a walk already in
 * flight, which no client can be made to do deliberately - so the state is
 * seeded rather than the route to it.
 */
export async function expireCursors(email: string): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/expire-cursors`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Named, so that a spec running beside this one cannot spend the arming.
    body: JSON.stringify({ email }),
  });

  expect(response.status, "the fake API armed the stale cursor").toBe(204);
}

/**
 * Adds a second campaign, which is the only way the switcher appears: every
 * account registers with one, and only creating another is entitled.
 */
export async function seedCampaign(email: string, name: string): Promise<string> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, name }),
  });

  expect(response.status, "the fake API seeded the campaign").toBe(201);

  const body = (await response.json()) as { id: string };
  return body.id;
}

/** How many times the client actually asked the API for a page. */
export async function applicationRequestCount(email: string): Promise<number> {
  const response = await fetch(
    `${FAKE_API_ORIGIN}/__test/application-requests?email=${encodeURIComponent(email)}`,
  );
  const body = (await response.json()) as { count: number };

  return body.count;
}

/**
 * Opens the command palette, having first waited for it to be listening.
 *
 * The shortcut is a window listener that only exists once the palette has
 * hydrated, so a keypress sent before that is simply lost - which shows up as a
 * palette that did not open, on a slow machine, sometimes. The trigger's
 * keyboard hint is the signal to wait for: it is rendered from the client
 * snapshot only, so seeing it means the component is running.
 */
export async function openPalette(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /⌘K|Ctrl K/ })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");

  await expect(page.getByPlaceholder("Go to a screen or switch campaign")).toBeVisible();
}

/**
 * Seeds an account straight into the fake API, bypassing the register form.
 *
 * The zone is worth naming when a spec asserts how an instant reads: the form
 * sends none and the API defaults it, so an account registered through the UI is
 * always UTC and an assertion against it would pass however the instant was
 * formatted.
 */
export async function seedAccount(email: string, timeZoneId?: string): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, timeZoneId }),
  });

  expect(response.status, "the fake API seeded the account").toBe(201);
}

/**
 * Seeds the account's field definitions.
 *
 * A spec states their ids so it can key answers to them in the application seed:
 * the bag on an application is keyed by definition id, and a generated id could
 * not be referred to from the same literal.
 */
export async function seedCustomFields(
  email: string,
  fields: Record<string, unknown>[],
): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/custom-fields`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, fields }),
  });

  expect(response.status, "the fake API seeded the custom fields").toBe(201);
}

export async function seedContacts(
  email: string,
  applicationId: string,
  contacts: Record<string, unknown>[],
): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, applicationId, contacts }),
  });

  expect(response.status, "the fake API seeded the contacts").toBe(201);
}

export async function seedInterviews(
  email: string,
  applicationId: string,
  interviews: Record<string, unknown>[],
): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/interviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, applicationId, interviews }),
  });

  expect(response.status, "the fake API seeded the interviews").toBe(201);
}

/**
 * Makes one of the detail screen's calls fail for this account.
 *
 * Named, so a spec running beside this one cannot be the request that spends it -
 * the same rule the stale-cursor arming follows. A read stays armed and the
 * add-note write is spent on its first refusal; the fake says why.
 */
export async function failCalls(email: string, calls: string[]): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/fail-calls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, calls }),
  });

  expect(response.status, "the fake API armed the failing call").toBe(204);
}

/**
 * Seeds an application's timeline.
 *
 * The API writes a Created entry with every application and a StageChanged entry
 * with every move, neither of which this client can cause yet - so a spec that
 * wants history states it rather than driving it.
 */
export async function seedActivity(
  email: string,
  applicationId: string,
  entries: Record<string, unknown>[],
): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/activity`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, applicationId, entries }),
  });

  expect(response.status, "the fake API seeded the activity").toBe(201);
}

/** Every `Idempotency-Key` this account has sent, in order. */
export async function idempotencyKeys(email: string): Promise<string[]> {
  const response = await fetch(
    `${FAKE_API_ORIGIN}/__test/idempotency-keys?email=${encodeURIComponent(email)}`,
  );
  const body = (await response.json()) as { keys: string[] };

  return body.keys;
}

/**
 * Sets the account's tier.
 *
 * Free unless a spec says otherwise, matching the fake's own default and the
 * plan every account registers on.
 */
export async function seedPlan(email: string, tier: "Free" | "Pro"): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, tier }),
  });

  expect(response.status, "the fake API seeded the plan").toBe(204);
}

/**
 * The body the last full replace actually sent.
 *
 * The assertion this exists for is not what the screen shows afterwards - it is
 * that every field the user never touched went back out carrying what it came in
 * with. A `PUT` that replaces turns an omission into a deletion, and the screen
 * would look right either way until the next read.
 */
export async function lastUpdateBody(email: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${FAKE_API_ORIGIN}/__test/last-update?email=${encodeURIComponent(email)}`,
  );
  const body = (await response.json()) as { body: Record<string, unknown> | null };

  return body.body;
}

/**
 * The body the last interview write sent, for the same reason.
 *
 * A round's replace clears its notes as easily as an application's clears its
 * fields, and here the trap is narrower: an edit that only records how a round
 * went still has to send back the time, the kind and the format it came in with.
 */
export async function lastInterviewWriteBody(
  email: string,
): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${FAKE_API_ORIGIN}/__test/last-interview-write?email=${encodeURIComponent(email)}`,
  );
  const body = (await response.json()) as { body: Record<string, unknown> | null };

  return body.body;
}
