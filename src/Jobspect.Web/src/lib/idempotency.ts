/**
 * Minting an idempotency key, on the side of the boundary that forms the intent.
 *
 * This half lives in `lib/` rather than beside the header and the retry delay in
 * `server/api/idempotency.ts`, and the split is a hard constraint rather than a
 * preference: a key is minted in the client component that owns the gesture, and
 * everything under `src/server/` opens with `import 'server-only'`, which a
 * client component cannot import at all. Spending a key stays on the server;
 * forming one has to be reachable from the browser.
 */

/**
 * One key for one user intent.
 *
 * Call this where the intent forms - the moment the user commits - and carry the
 * result verbatim through every retry of that same intent. Minting inside the
 * action, or inside a retry loop, is how one submitted note becomes two.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** A key and the payload it was minted for. */
export interface Intent {
  key: string;
  payload: string;
}

/**
 * The key to send for this payload: the previous one when the payload is
 * unchanged, a fresh one when it is not.
 *
 * Reusing a key is what makes a retry safe, but reusing it for *different*
 * content is a different mistake. The API fingerprints the request body, so the
 * same key over an edited note is refused as `idempotency.key_reused` - which
 * `errors.ts` classifies as a client bug, correctly. So the key belongs to the
 * payload rather than to the form: retrying the same text reuses it, editing the
 * text is a new intent.
 */
export function keyForIntent(previous: Intent | null, payload: string): Intent {
  if (previous !== null && previous.payload === payload) return previous;

  return { key: newIdempotencyKey(), payload };
}
