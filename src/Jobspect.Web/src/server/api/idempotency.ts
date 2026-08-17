import "server-only";

import type { ApiResult } from "@/server/api/client";

// Spending a key. Forming one lives in `@/lib/idempotency`, because it happens
// in a client component and nothing under `src/server/` can be imported from
// there - see that file's header.

/**
 * The header the API reads. It is not in the contract, so `openapi-fetch` will
 * not type it and it has to travel through `headers` by hand.
 *
 * Merge it into whatever headers the caller was already given rather than
 * replacing them: `callAuthenticated` re-issues a call with an `Authorization`
 * header of its own after a forced refresh, and overwriting that sends the one
 * retry that matters out unauthenticated.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export function idempotencyHeaders(key: string): Record<string, string> {
  return { [IDEMPOTENCY_HEADER]: key };
}

/** How long to wait before re-issuing a key the server says is still in flight. */
export function inFlightDelayMs(retryAfterSeconds: number | null): number {
  // The API sends Retry-After on this path; the floor only covers its absence,
  // and the ceiling stops a hostile or mistaken header from parking the UI.
  const seconds = retryAfterSeconds ?? 1;
  return Math.min(Math.max(seconds, 1), 10) * 1000;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One write, and one re-issue of the **same key** if the first attempt is told
 * its own key is still in flight.
 *
 * `idempotency.in_flight` means the API is already executing this exact request:
 * the answer is to wait for it and ask again, not to give up and not to mint a
 * new key - a new key is a second write. Waiting the interval the server asked
 * for is what makes the second attempt likely to find the record rather than the
 * lock.
 *
 * Exactly one re-issue. A second in-flight answer means the first attempt is
 * slower than the server's own estimate, and a third try turns a slow write into
 * a loop the user is stuck inside - so it is reported, and the caller says the
 * write is still happening rather than that it failed.
 */
export async function withInFlightRetry<T>(
  key: string,
  send: (key: string) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  const first = await send(key);
  if (first.ok || first.failure.kind !== "idempotency-in-flight") return first;

  await wait(inFlightDelayMs(first.failure.retryAfterSeconds));

  return send(key);
}
