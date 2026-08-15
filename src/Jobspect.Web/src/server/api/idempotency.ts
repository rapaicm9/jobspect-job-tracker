import "server-only";

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
