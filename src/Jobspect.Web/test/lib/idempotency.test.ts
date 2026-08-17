import { describe, expect, it } from "vitest";

import { keyForIntent, newIdempotencyKey } from "@/lib/idempotency";

describe("keyForIntent", () => {
  it("mints a key when there is no previous intent", () => {
    const intent = keyForIntent(null, "Called the recruiter back.");

    expect(intent.key).not.toBe("");
    expect(intent.payload).toBe("Called the recruiter back.");
  });

  // The whole point of the mechanism: a retry of one intent carries the key it
  // started with. Regenerating on retry is how one submitted note becomes two,
  // and it is invisible until it happens to a user.
  it("reuses the key while the payload is unchanged", () => {
    const first = keyForIntent(null, "Called the recruiter back.");
    const retry = keyForIntent(first, "Called the recruiter back.");
    const again = keyForIntent(retry, "Called the recruiter back.");

    expect(retry.key).toBe(first.key);
    expect(again.key).toBe(first.key);
  });

  it("mints a new key when the payload changes", () => {
    // Not tidiness. The API fingerprints the request body, so the same key over
    // edited text is refused as `idempotency.key_reused` - the key belongs to
    // the payload rather than to the form it was typed into.
    const first = keyForIntent(null, "Called the recruiter back.");
    const edited = keyForIntent(first, "Called the recruiter back. No answer.");

    expect(edited.key).not.toBe(first.key);
    expect(edited.payload).toBe("Called the recruiter back. No answer.");
  });

  it("treats a return to the earlier text as a new intent", () => {
    // Only the immediately previous payload is remembered, which is the honest
    // bound: the earlier key may already have been spent, and re-sending it
    // would replay a note the user has since decided to send again.
    const first = keyForIntent(null, "One");
    const edited = keyForIntent(first, "Two");
    const back = keyForIntent(edited, "One");

    expect(back.key).not.toBe(first.key);
  });
});

describe("newIdempotencyKey", () => {
  it("mints a distinct key per call", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
