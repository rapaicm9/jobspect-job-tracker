import { createHash, randomUUID } from "node:crypto";

import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
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
 * Opens the transition menu on the application detail screen.
 *
 * Here rather than in one spec because two of them open it, and the reason it
 * needs a helper at all is the reason `openPalette` does: the control only works
 * once its component has hydrated, and a click landing before that is simply
 * lost. A button has no bare href to fall back on the way a link does, so the
 * gesture is retried rather than the assertion - which is what makes it
 * independent of hydration order rather than lucky about it.
 */
export async function openTransitionMenu(page: Page) {
  const trigger = page.getByRole("button", { name: "Move" });
  const menu = page.getByRole("menu");

  await expect(async () => {
    await trigger.click();
    await expect(menu).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  return menu;
}

/**
 * The board's close-out zone, which only exists while a card is in hand.
 *
 * Matched on the half of the label that is unique: the picker it opens is titled
 * "Close out {role}", so the first two words are not enough to tell them apart.
 */
export function closeOutZone(page: Page): Locator {
  return page.getByText("drop to record an outcome");
}

/**
 * Presses a card's grip and starts the drag, leaving the pointer just off it.
 *
 * Real pointer events rather than Playwright's `dragTo`, which dispatches the
 * HTML5 drag-and-drop events that dnd-kit's PointerSensor does not listen for -
 * that call succeeds and moves nothing, which is the worst shape a test failure
 * can take.
 *
 * Split out from the drag because the close-out zone does not exist until the
 * drag is live: a spec has to lift the card before it can find its target. No
 * pause after the press either - the sensor's default constraints return none at
 * all for a mouse whose press landed on the drag handle, so one small move is
 * enough to make the drag live.
 */
export async function liftCard(page: Page, role: string): Promise<void> {
  const handle = page.getByRole("button", { name: `Move ${role}` });
  await handle.scrollIntoViewIfNeeded();

  const from = await handle.boundingBox();
  expect(from, "the card's drag handle is on screen").not.toBeNull();

  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2 + 4);
}

/**
 * Finishes a lift over a target and releases.
 *
 * The intermediate steps are what give collision detection something to run
 * against; a single jump can land the pointer on the target without ever having
 * been detected over it. The second move is so the drop happens on a pointer
 * position the collision pass has already seen rather than on the one that
 * arrived with it.
 */
export async function dropOnTarget(target: Locator, name: string): Promise<void> {
  const page = target.page();
  const to = await target.boundingBox();
  expect(to, `${name} is on screen`).not.toBeNull();

  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 16 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2 + 8, { steps: 4 });
  await page.mouse.up();
}

/** Drags a card by its grip and drops it on a column. */
export async function dragCardTo(page: Page, role: string, stage: string): Promise<void> {
  await liftCard(page, role);
  await dropOnTarget(page.getByRole("region", { name: stage }), `the ${stage} column`);
}

/**
 * Drags a card onto the close-out zone and waits for the picker it opens.
 *
 * The zone is looked up after the lift rather than before it, which is the whole
 * shape of this helper: it is not on the board at rest.
 */
export async function dragCardToCloseOut(page: Page, role: string): Promise<Locator> {
  await liftCard(page, role);

  const zone = closeOutZone(page);
  await expect(zone).toBeVisible();
  await dropOnTarget(zone, "the close-out zone");

  const picker = page.getByRole("dialog");
  await expect(picker).toBeVisible();

  return picker;
}

/**
 * What dnd-kit is saying about the drag.
 *
 * Read by the element id the Accessibility plugin is configured with, because the
 * board has a second `role="status"` of its own for what a move did and a query
 * by role matches both.
 */
export function dragAnnouncement(page: Page): Locator {
  return page.locator("#dnd-kit-announcement-board");
}

/** What the board says the last move actually did. */
export function moveAnnouncement(page: Page): Locator {
  return page.locator("#board-outcome");
}

/**
 * Picks a card up with the keyboard, the way the instructions say to.
 *
 * The grip is focused directly rather than tabbed to: how many stops away it is
 * depends on how many cards sit above it, which is a fact about the fixture
 * rather than about the keyboard path.
 *
 * Retried for the reason `openTransitionMenu` is - the sensor binds its keydown
 * listener when the component hydrates, and a press that lands before that is
 * simply lost. It shows up as a card that never lifted, and it shows up more on
 * the specs with large fixtures, because those take longer to hydrate.
 *
 * The retry checks `aria-pressed` before pressing rather than pressing blindly:
 * space both lifts and drops, so a second press on a drag that did start would
 * put the card down again.
 */
export async function liftCardWithKeyboard(page: Page, role: string): Promise<void> {
  const handle = page.getByRole("button", { name: `Move ${role}` });

  // dnd-kit builds its live region and stamps the grip's drag state in one
  // scheduled batch, and a lift dispatched before that batch has run is never
  // announced at all: the listener finds no text node to write into and gives up,
  // and dragstart happens once. Both of these wait for that batch - the region to
  // exist, and the attribute to have been written even once.
  await expect(dragAnnouncement(page)).toBeAttached();
  await expect(handle).toHaveAttribute("aria-pressed", "false");

  await expect(async () => {
    if ((await handle.getAttribute("aria-pressed")) !== "true") {
      await handle.focus();
      await page.keyboard.press("Space");
    }

    await expect(handle).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  // The lift has to have been announced before a direction key means anything,
  // and the close-out zone only mounts on the render that follows.
  await expect(dragAnnouncement(page)).toContainText("Picked up");
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
 * Fails the list read for the named stages, and only those.
 *
 * `failCalls` names an endpoint, which cannot separate two reads of the same one.
 * The board makes five and degrades each on its own, so the assertion worth
 * having - one broken column, three still standing - needs a seam that refuses
 * exactly one of them.
 */
export async function failStageReads(email: string, stages: string[]): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/fail-stage-reads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, stages }),
  });

  expect(response.status, "the fake API armed the failing stage read").toBe(204);
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
 * The body the last contact write sent.
 *
 * The two links are why this matters here: a contact's application and company
 * are carried by every replace and rendered by nothing, so dropping one changes
 * the record and leaves the screen looking exactly as it did.
 */
export async function lastContactWriteBody(email: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${FAKE_API_ORIGIN}/__test/last-contact-write?email=${encodeURIComponent(email)}`,
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
