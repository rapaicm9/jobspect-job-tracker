// The taint APIs are declared in React's experimental types, which tsconfig does
// not pull in by default. A reference directive rather than an import: that
// module has types but no runtime, so importing it typechecks and then fails the
// bundler. Directives have to precede every statement, which is why this sits
// above `server-only`.
/// <reference types="react/experimental" />
import "server-only";

import { redirect } from "next/navigation";
import { cache, experimental_taintUniqueValue } from "react";

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
 * A second layer under the `server-only` lint rule, working in the opposite
 * direction: that rule stops a server module reaching the browser, this stops a
 * server module handing a credential across the boundary as an ordinary prop.
 * Either value is enough to act as the user, and both are one careless prop away
 * from the client.
 *
 * `userId` is deliberately left alone - it is an opaque identifier the API
 * already treats as safe to expose, and tainting it would make rendering the
 * account impossible.
 */
function protect(session: Session): Session {
  experimental_taintUniqueValue(
    "Do not pass the access token to the client. Call the API from a Server Component or a Server Action instead.",
    session,
    session.accessToken,
  );
  experimental_taintUniqueValue(
    "Do not pass the session id to the client. It is the cookie's value, and anything holding it is the session.",
    session,
    session.sid,
  );

  return session;
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
      return protect({
        sid,
        userId: outcome.tokens.userId,
        accessToken: outcome.tokens.accessToken,
      });

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
