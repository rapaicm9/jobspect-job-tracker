import { describe, expect, it } from "vitest";

import { newIdempotencyKey } from "@/lib/idempotency";
import { IDEMPOTENCY_HEADER, idempotencyHeaders, inFlightDelayMs } from "@/server/api/idempotency";

describe("idempotency keys", () => {
  it("mints a distinct key per intent", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  // The whole point of the mechanism: a retry of one intent carries the key it
  // started with. Regenerating on retry is how one dragged card becomes two
  // transitions, and it is invisible until it happens to a user.
  it("reuses the same key across every retry of one intent", () => {
    const key = newIdempotencyKey();

    const attempts = [1, 2, 3].map(() => idempotencyHeaders(key));

    for (const headers of attempts) {
      expect(headers[IDEMPOTENCY_HEADER]).toBe(key);
    }
  });

  it("sends the key under the header the API reads", () => {
    expect(idempotencyHeaders("abc")).toEqual({ "Idempotency-Key": "abc" });
  });
});

describe("in-flight backoff", () => {
  it("honours Retry-After when the server sends one", () => {
    expect(inFlightDelayMs(3)).toBe(3000);
  });

  it("falls back to a second when the header is absent", () => {
    expect(inFlightDelayMs(null)).toBe(1000);
  });

  it("clamps a value that would park the UI", () => {
    expect(inFlightDelayMs(3600)).toBe(10_000);
    expect(inFlightDelayMs(0)).toBe(1000);
  });
});
