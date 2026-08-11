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

/**
 * Expired in place rather than `delete`d by name.
 *
 * `cookies().delete(name)` emits a `Set-Cookie` carrying the name, an empty
 * value and an expiry in 1970 - and no other attribute. The `__Host-` prefix
 * rules apply to that line as much as to the one that set the cookie, so a
 * browser refuses it for want of `Secure` and `Path=/` and keeps the cookie it
 * was just told to drop. Signing out then cleared the session record while
 * leaving the browser holding its id for another thirty days, and the next visit
 * read as "your session ended" rather than as a sign-out.
 */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();

  store.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_ATTRIBUTES, maxAge: 0 });
}
