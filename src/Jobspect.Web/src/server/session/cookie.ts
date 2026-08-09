import "server-only";

import { cookies } from "next/headers";

/**
 * The `__Host-` prefix is a browser-enforced contract: a cookie carrying it is
 * rejected unless it is `Secure`, has `Path=/`, and names no `Domain`. That last
 * one is the reason to want it - without it, anything able to write a cookie on
 * a sibling subdomain could write one this service would read.
 *
 * The `Secure` requirement does not make local development awkward, because
 * browsers waive the https check for localhost.
 */
export const SESSION_COOKIE = "__Host-jobspect.sid";

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * `expiresAt` is the refresh token's expiry, so the browser stops sending a
 * cookie that could no longer be exchanged for anything.
 */
export async function writeSessionCookie(sid: string, expiresAt: Date): Promise<void> {
  const store = await cookies();

  store.set(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    // Lax rather than Strict: Strict drops the cookie on a top-level navigation
    // in from elsewhere, so following a link back into the app would land on the
    // login page. Server Actions carry their own CSRF defence.
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
