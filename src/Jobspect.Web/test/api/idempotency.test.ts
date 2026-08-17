import { afterEach, describe, expect, it, vi } from "vitest";

import { newIdempotencyKey } from "@/lib/idempotency";
import type { ApiResult } from "@/server/api/client";
import type { ProblemBody } from "@/server/api/errors";
import {
  IDEMPOTENCY_HEADER,
  idempotencyHeaders,
  inFlightDelayMs,
  withInFlightRetry,
} from "@/server/api/idempotency";

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

describe("withInFlightRetry", () => {
  const problem: ProblemBody = { status: 409, code: "idempotency.in_flight" };

  const inFlight: ApiResult<string> = {
    ok: false,
    failure: { kind: "idempotency-in-flight", retryAfterSeconds: 2, problem },
  };

  const failed: ApiResult<string> = {
    ok: false,
    failure: { kind: "server-fault", problem: { status: 500 } },
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Drives the wait without spending it, so the suite stays under a second. */
  async function run(send: (key: string) => Promise<ApiResult<string>>) {
    vi.useFakeTimers();

    const pending = withInFlightRetry("key-1", send);
    await vi.runAllTimersAsync();

    return pending;
  }

  it("does not retry a call that succeeded", async () => {
    const send = vi.fn(() => Promise.resolve<ApiResult<string>>({ ok: true, data: "entry" }));

    await expect(run(send)).resolves.toEqual({ ok: true, data: "entry" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failure that is not an in-flight key", async () => {
    // A 500 is not the server saying "this exact request is already running", so
    // re-issuing the key would only be a second attempt at a broken write.
    const send = vi.fn(() => Promise.resolve(failed));

    await expect(run(send)).resolves.toEqual(failed);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("re-issues the same key once and returns what the retry answered", async () => {
    // A new key here would be a second write, which is the entire failure the
    // header exists to prevent.
    const keys: string[] = [];
    const send = vi.fn((key: string) => {
      keys.push(key);
      return Promise.resolve<ApiResult<string>>(
        keys.length === 1 ? inFlight : { ok: true, data: "entry" },
      );
    });

    await expect(run(send)).resolves.toEqual({ ok: true, data: "entry" });
    expect(keys).toEqual(["key-1", "key-1"]);
  });

  it("stops after one retry rather than looping on a slow write", async () => {
    // A second in-flight answer means the first attempt is slower than the
    // server's own estimate. The caller reports that the write is still
    // happening; it does not sit here asking.
    const send = vi.fn(() => Promise.resolve(inFlight));

    await expect(run(send)).resolves.toEqual(inFlight);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
