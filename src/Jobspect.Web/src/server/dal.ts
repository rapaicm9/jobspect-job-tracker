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
import { toPlanTier, type Entitlement, type PlanTier } from "@/server/api/enums";
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

export interface Plan {
  /** `null` when the server named a tier this build has never heard of. */
  tier: PlanTier | null;
  /** When the tier last moved. Absent for an account still on its original plan. */
  updatedAt: Date | null;
}

/**
 * Why there is no session, not just that there is none.
 *
 * The three absent states are told apart because the login page says something
 * different for each, and one of them is worth saying loudly: a revoked family
 * means a retired refresh token was replayed, and the account was signed out
 * everywhere on purpose. Reporting that as "your session expired" would hide the
 * one event a user would want to know about.
 */
export type SessionState =
  | { status: "active"; session: Session }
  | { status: "anonymous" }
  | { status: "expired" }
  | { status: "revoked" };

/** The query the login page reads to explain itself. */
export type SessionEndedReason = "expired" | "revoked";

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
export const verifySession = cache(async (): Promise<SessionState> => {
  const sid = await readSessionCookie();
  if (sid === null) return { status: "anonymous" };

  let outcome;
  try {
    outcome = await ensureFreshToken(sid);
  } catch {
    // Redis is unreachable, so there is no way to tell whose request this is.
    // Absent a session, the caller sends the user to log in - which is the right
    // answer, because a process that cannot read Redis cannot serve them either.
    return { status: "anonymous" };
  }

  switch (outcome.kind) {
    case "fresh":
    case "refreshed":
      return {
        status: "active",
        session: protect({
          sid,
          userId: outcome.tokens.userId,
          accessToken: outcome.tokens.accessToken,
        }),
      };

    case "no-session":
      // A cookie pointing at nothing: the record aged out, or a logout on another
      // request removed it. Either way the user was signed in once, so this is an
      // expiry rather than an anonymous visit.
      return { status: "expired" };

    case "destroyed":
      // The refresher has already deleted the record. The cookie still points at
      // it and cannot be cleared from a render, so it is dropped on the next
      // Server Action; until then it resolves to nothing, which is harmless.
      return { status: outcome.familyRevoked ? "revoked" : "expired" };

    case "unavailable":
      // Not a logout. An API outage must not sign the userbase out, least of all
      // when signing back in needs the same API to be up.
      throw new UpstreamError("refresh-unavailable");
  }
});

/** The active session, or the login page with a reason it can explain. */
export async function requireSession(): Promise<Session> {
  const state = await verifySession();
  if (state.status === "active") return state.session;

  // `redirect` throws, so nothing below runs for the other three.
  redirect(state.status === "anonymous" ? "/login" : `/login?reason=${state.status}`);
}

export const getAccount = cache(async (): Promise<Account | null> => {
  const state = await verifySession();
  if (state.status !== "active") return null;

  const result = await callAuthenticated(state.session.sid, (init) =>
    api.GET("/api/v1/account", init),
  );
  if (!result.ok) throw new UpstreamError(result.failure.kind);

  return {
    userId: result.data.userId,
    email: result.data.email,
    timeZoneId: result.data.timeZoneId,
    createdAt: new Date(result.data.createdAt),
  };
});

const reportedTiers = new Set<string>();

/**
 * The account's plan. Not cached in the session record by decision - a thirty-day
 * cache of a purchasable tier leaves an account that has just paid looking
 * unentitled - so the memo is what keeps four components from making four calls.
 *
 * An API failure throws rather than degrading to a tier. Callers need this to
 * decide what a full-replace body should say about a gated field, and a guess in
 * either direction is wrong: too generous costs a 403, too mean clears the
 * account's answers.
 */
export const getPlan = cache(async (): Promise<Plan | null> => {
  const state = await verifySession();
  if (state.status !== "active") return null;

  const result = await callAuthenticated(state.session.sid, (init) =>
    api.GET("/api/v1/billing/plan", init),
  );
  if (!result.ok) throw new UpstreamError(result.failure.kind);

  const tier = toPlanTier(result.data.tier);

  // Reported once per distinct value, the way an unrecognised stage is: the
  // conservative reading below is silent otherwise, and this is a tier nobody
  // gets the benefit of until the union is updated.
  if (tier === null && !reportedTiers.has(result.data.tier)) {
    reportedTiers.add(result.data.tier);
    console.warn(`Unrecognised plan tier from the API: ${result.data.tier}`);
  }

  return {
    tier,
    updatedAt: result.data.updatedAt === null ? null : new Date(result.data.updatedAt),
  };
});

/**
 * Whether a tier unlocks a capability. One purchase unlocks all of them in v1, so
 * the tier is the whole answer and `entitlement` is the seam a per-feature rule
 * would branch on later - the shape the server's own entitlement query has.
 *
 * An unrecognised tier is read as Free, matching the server's "no plan row means
 * entitled to nothing". It is the conservative half of a UI convenience and the
 * loud half of a write: a build that has not heard of the account's tier sends
 * nothing for a gated field, which retains what is stored on every tier that
 * refuses the write and replaces it on every tier that allows one.
 */
export function grants(tier: PlanTier | null, entitlement: Entitlement): boolean {
  void entitlement;

  return tier === "Pro";
}

/**
 * A UI convenience, not a security control. The server re-checks inside the
 * handler, so a check here that disagrees produces a 403 and nothing worse. Say
 * so wherever it is called, or somebody will eventually treat it as the gate.
 *
 * Not separately memoised: `getPlan` holds the memo, so however many
 * entitlements a render asks about, the API is called once.
 */
export async function hasEntitlement(entitlement: Entitlement): Promise<boolean> {
  const plan = await getPlan();

  return plan !== null && grants(plan.tier, entitlement);
}
