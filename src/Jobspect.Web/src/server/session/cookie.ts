import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE, SESSION_COOKIE_ATTRIBUTES } from "@/lib/session-cookie";

export { SESSION_COOKIE };

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * `expiresAt` is the refresh token's expiry, so the browser stops sending a
 * cookie that could no longer be exchanged for anything. Rotation slides that
 * expiry forward and a render cannot write a cookie, so `proxy.ts` re-stamps it
 * per request rather than this being the only place it is set.
 */
export async function writeSessionCookie(sid: string, expiresAt: Date): Promise<void> {
  const store = await cookies();

  store.set(SESSION_COOKIE, sid, { ...SESSION_COOKIE_ATTRIBUTES, expires: expiresAt });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
