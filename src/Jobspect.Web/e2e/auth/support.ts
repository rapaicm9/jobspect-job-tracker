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
  await expect(page).toHaveURL(/\/applications$/);
}

export async function signInThroughTheForm(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await submitCredentials(page, email, "Sign in");
}

/** Seeds an account straight into the fake API, bypassing the register form. */
export async function seedAccount(email: string): Promise<void> {
  const response = await fetch(`${FAKE_API_ORIGIN}/__test/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  expect(response.status, "the fake API seeded the account").toBe(201);
}
