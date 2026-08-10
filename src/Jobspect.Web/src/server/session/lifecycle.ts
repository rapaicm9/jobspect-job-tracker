import "server-only";

import { api, callApi } from "@/server/api/client";
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from "@/server/session/cookie";
import { sessionStore, type SessionTokens } from "@/server/session/store";

/**
 * Opens a session from a token pair, without asking how it was obtained.
 *
 * Register and login both land here - registration hands back the same pair a
 * login would, so neither path makes a second call - and a passkey flow reaching
 * the same pair later reuses every line of this unchanged.
 */
export async function createSession(tokens: SessionTokens): Promise<void> {
  const sid = await sessionStore().create(tokens);
  await writeSessionCookie(sid, new Date(tokens.refreshTokenExpiresAt));
}

/**
 * Closes it from both ends.
 *
 * The API call retires the refresh token so the row stops being a way back in;
 * the local record and the cookie go regardless of how that call went. A logout
 * that reports success while leaving a usable session behind is worse than one
 * that leaves a token to expire on its own.
 */
export async function destroySession(): Promise<void> {
  const sid = await readSessionCookie();

  if (sid !== null) {
    const store = sessionStore();
    const tokens = await store.read(sid);

    if (tokens !== null) {
      await callApi(() =>
        api.POST("/api/v1/identity/logout", { body: { refreshToken: tokens.refreshToken } }),
      );
    }

    await store.destroy(sid);
  }

  await clearSessionCookie();
}
