import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { api } from "@/server/api/client";
import type { ApiFailure } from "@/server/api/errors";
import { callAuthenticated } from "@/server/session/call";
import { readSessionCookie } from "@/server/session/cookie";
import { ensureFreshToken } from "@/server/session/refresh";

/**
 * Authorization lives here, not in `proxy.ts`. Middleware runs on every request
 * including prefetches, and a layout does not re-render on navigation, so
 * neither controls whether the rest of a route renders.
 */

/** The API could not answer. Transient by assumption: the session survives it. */
export class UpstreamError extends Error {
  constructor(readonly kind: ApiFailure["kind"] | "refresh-unavailable") {
    super(`The API could not serve this request: ${kind}.`);
    this.name = "UpstreamError";
  }
}

export interface Session {
  /** Server-side only, and the key the refresh path locks on. Never rendered. */
  sid: string;
  userId: string;
  accessToken: string;
}

export interface Account {
  userId: string;
  email: string;
  timeZoneId: string;
  createdAt: Date;
}

/**
 * Memoised for the render pass, which is the cheap half of the single-flight:
 * four Server Components sharing one page share one already-fresh token and
 * never reach the lock. The lock is what covers everything the memo cannot see -
 * two tabs, a prefetch racing a navigation, a Server Action firing mid-render.
 */
export const verifySession = cache(async (): Promise<Session | null> => {
  const sid = await readSessionCookie();
  if (sid === null) return null;

  let outcome;
  try {
    outcome = await ensureFreshToken(sid);
  } catch {
    // Redis is unreachable, so there is no way to tell whose request this is.
    // Absent a session, the caller sends the user to log in - which is the right
    // answer, because a process that cannot read Redis cannot serve them either.
    return null;
  }

  switch (outcome.kind) {
    case "fresh":
    case "refreshed":
      return { sid, userId: outcome.tokens.userId, accessToken: outcome.tokens.accessToken };

    case "no-session":
      return null;

    case "destroyed":
      // The refresher has already deleted the record. The cookie still points at
      // it and cannot be cleared from a render, so it is dropped on the next
      // Server Action; until then it resolves to nothing, which is harmless.
      console.warn(
        `Session destroyed during refresh (family revoked: ${String(outcome.familyRevoked)}).`,
      );
      return null;

    case "unavailable":
      // Not a logout. An API outage must not sign the userbase out, least of all
      // when signing back in needs the same API to be up.
      throw new UpstreamError("refresh-unavailable");
  }
});

export async function requireSession(): Promise<Session> {
  const session = await verifySession();
  if (session === null) redirect("/login");
  return session;
}

export const getAccount = cache(async (): Promise<Account | null> => {
  const session = await verifySession();
  if (session === null) return null;

  const result = await callAuthenticated(session.sid, (init) => api.GET("/api/v1/account", init));
  if (!result.ok) throw new UpstreamError(result.failure.kind);

  return {
    userId: result.data.userId,
    email: result.data.email,
    timeZoneId: result.data.timeZoneId,
    createdAt: new Date(result.data.createdAt),
  };
});
