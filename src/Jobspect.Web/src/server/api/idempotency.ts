import "server-only";

/**
 * The header the API reads. It is not in the contract, so `openapi-fetch` will
 * not type it and it has to travel through `headers` by hand.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/**
 * Mints a key for one user intent.
 *
 * Call this where the intent forms - the moment the user commits to the action,
 * in the client component that owns the gesture - and carry the result verbatim
 * through every retry of that same intent. Minting inside the action or inside a
 * retry loop is how one dragged card becomes two transitions.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

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
