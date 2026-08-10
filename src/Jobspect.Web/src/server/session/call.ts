import "server-only";

import { callApi, type ApiResult } from "@/server/api/client";
import { sessionRefresher, type Refresher } from "@/server/session/refresh";

/**
 * A call the caller can re-issue with extra headers.
 *
 * The retry has to carry its token on the request itself. The access-token
 * provider is memoised for the render pass and cannot be invalidated, so asking
 * it again after a forced rotation would hand back the token that just failed.
 */
export type AuthenticatedSend<T> = (init: {
  headers?: Record<string, string>;
}) => Promise<{ data?: T; error?: unknown; response: Response }>;

export type AuthenticatedCaller = <T>(
  sid: string,
  send: AuthenticatedSend<T>,
) => Promise<ApiResult<T>>;

/**
 * One API call with a single retry on a stale token.
 *
 * Proactive rotation covers the tokens that age out, which is nearly all of
 * them. What it cannot see is a token invalidated before its expiry - a
 * logout-all on another device bumps the account's token version and every
 * access token in circulation stops working with time still on the clock. That
 * arrives as the bodyless 401, and it is the only 401 refreshing repairs.
 *
 * Exactly one retry. A second stale token means something other than an aged
 * credential, and a third attempt turns a broken session into a loop.
 *
 * This lives beside the session rather than under `src/server/api/` because it
 * needs both layers, and the API client cannot import the session layer that
 * already imports it.
 */
export function createAuthenticatedCaller(refresher: Refresher): AuthenticatedCaller {
  return async function callAuthenticated(sid, send) {
    const first = await callApi(() => send({}));
    if (first.ok || first.failure.kind !== "token-stale") return first;

    const outcome = await refresher.forceRefresh(sid);
    if (outcome.kind !== "fresh" && outcome.kind !== "refreshed") return first;

    return callApi(() =>
      send({ headers: { Authorization: `Bearer ${outcome.tokens.accessToken}` } }),
    );
  };
}

let caller: AuthenticatedCaller | undefined;

export const callAuthenticated: AuthenticatedCaller = (sid, send) =>
  (caller ??= createAuthenticatedCaller(sessionRefresher()))(sid, send);
