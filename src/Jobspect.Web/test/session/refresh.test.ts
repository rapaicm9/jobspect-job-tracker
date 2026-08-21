import { createHash } from "node:crypto";

import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createRefresher, type Refresher } from "@/server/session/refresh";
import { createSessionStore, type SessionStore, type SessionTokens } from "@/server/session/store";

import { createFakeRedis, type FakeRedis } from "./fake-redis";

const BASE = "http://api.test";
const REFRESH_URL = `${BASE}/api/v1/identity/refresh`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Longer than the 5s lock TTL, so a holder that pauses this long has lost it. */
const LOCK_OUTLIVED_MS = 6_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let clock: Date;
const now = () => clock;

let redis: FakeRedis;
let store: SessionStore;
let refresher: Refresher;
let exchanges: number;

function tokens(overrides: Partial<SessionTokens> = {}): SessionTokens {
  return {
    userId: "01997a1e-0000-7000-8000-000000000001",
    accessToken: "access-original",
    accessTokenExpiresAt: new Date(clock.getTime() + 10 * 60 * 1000).toISOString(),
    refreshToken: "refresh-original",
    refreshTokenExpiresAt: new Date(clock.getTime() + 30 * DAY_MS).toISOString(),
    ...overrides,
  };
}

/** Inside the 60s skew, so it is due for rotation without having expired. */
function expiringTokens(): SessionTokens {
  return tokens({ accessTokenExpiresAt: new Date(clock.getTime() + 30_000).toISOString() });
}

function rotated(overrides: Partial<SessionTokens> = {}): SessionTokens {
  return tokens({
    accessToken: "access-rotated",
    refreshToken: "refresh-rotated",
    ...overrides,
  });
}

function sessionKeyFor(sid: string): string {
  return `web:sess:${createHash("sha256").update(sid).digest("hex")}`;
}

function lockKeyFor(sid: string): string {
  return `web:lock:refresh:${createHash("sha256").update(sid).digest("hex")}`;
}

/** Counts what reached the wire, so a second rotation cannot hide behind a spy. */
function respondToRefresh(handler: () => Response | Promise<Response>) {
  server.use(
    http.post(REFRESH_URL, async () => {
      exchanges += 1;
      return handler();
    }),
  );
}

beforeEach(() => {
  clock = new Date("2026-08-10T12:00:00.000Z");
  redis = createFakeRedis(now);
  store = createSessionStore(redis, now);
  // Far shorter than production's 50ms/6s: the bound under test is "gives up"
  // rather than "gives up after six seconds", and the suite should not pay for
  // the difference.
  refresher = createRefresher(store, redis, { now, pollIntervalMs: 10, waitBudgetMs: 200 });
  exchanges = 0;
});

describe("a token with time left", () => {
  it("is returned without a call or a lock", async () => {
    const sid = await store.create(tokens());

    const outcome = await refresher.ensureFresh(sid);

    expect(outcome.kind).toBe("fresh");
    expect(exchanges).toBe(0);
    expect(redis.keys()).not.toContain(lockKeyFor(sid));
  });
});

describe("a token inside the skew", () => {
  it("rotates and stores the replacement", async () => {
    respondToRefresh(() => HttpResponse.json(rotated()));
    const sid = await store.create(expiringTokens());

    const outcome = await refresher.ensureFresh(sid);

    expect(outcome.kind).toBe("refreshed");
    expect(outcome.kind === "refreshed" && outcome.tokens.accessToken).toBe("access-rotated");
    expect((await store.read(sid))?.refreshToken).toBe("refresh-rotated");
  });

  it("releases the lock afterwards", async () => {
    respondToRefresh(() => HttpResponse.json(rotated()));
    const sid = await store.create(expiringTokens());

    await refresher.ensureFresh(sid);

    expect(redis.keys()).not.toContain(lockKeyFor(sid));
  });
});

// The suite this whole design exists for. The backend revokes every session an
// account holds when it sees a refresh token it has already retired, so a page
// fanning out to four endpoints on an expired token must not present the same
// token four times. Do not delete or skip this.
describe("ten parallel requests on an expired token", () => {
  it("produce exactly one refresh call", async () => {
    respondToRefresh(() => HttpResponse.json(rotated()));
    const sid = await store.create(expiringTokens());

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => refresher.ensureFresh(sid)),
    );

    expect(exchanges).toBe(1);
    expect(outcomes).toHaveLength(10);
    for (const outcome of outcomes) {
      expect(outcome.kind === "fresh" || outcome.kind === "refreshed").toBe(true);
      expect(
        (outcome.kind === "fresh" || outcome.kind === "refreshed") && outcome.tokens.accessToken,
      ).toBe("access-rotated");
    }
  });

  it("still produce one call when that call fails", async () => {
    respondToRefresh(() => HttpResponse.json({ title: "Service Unavailable" }, { status: 503 }));
    const sid = await store.create(expiringTokens());

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => refresher.ensureFresh(sid)),
    );

    // The nine that lost wait for a token that never arrives and give up. None
    // of them retries the exchange: presenting the same refresh token behind
    // the holder is the move that revokes the family.
    expect(exchanges).toBe(1);
    expect(outcomes.every((outcome) => outcome.kind === "unavailable")).toBe(true);
  });
});

describe("losing the lock", () => {
  it("never calls refresh, even when the holder never finishes", async () => {
    server.use(http.post(REFRESH_URL, () => HttpResponse.error()));
    const sid = await store.create(expiringTokens());

    // A lock nobody will release, standing in for a holder that died.
    await redis.set(lockKeyFor(sid), "someone-else", "PX", 5_000, "NX");

    const outcome = await refresher.ensureFresh(sid);

    expect(outcome.kind).toBe("unavailable");
    expect(exchanges).toBe(0);
  });

  it("reports the session gone when a logout lands while waiting", async () => {
    const sid = await store.create(expiringTokens());
    await redis.set(lockKeyFor(sid), "someone-else", "PX", 5_000, "NX");

    const waiting = refresher.ensureFresh(sid);
    await store.destroy(sid);

    expect((await waiting).kind).toBe("no-session");
  });
});

describe("waiting while the store is slow", () => {
  it("gives up on the budget rather than on the poll count", async () => {
    const sid = await store.create(expiringTokens());
    await redis.set(lockKeyFor(sid), "someone-else", "PX", 5_000, "NX");

    // The poll count is not a duration, because every poll costs a read. At this
    // latency the hundred polls the budget allows would run for five seconds -
    // which is how a six-second production budget was seen to keep a render
    // waiting for the better part of a minute.
    const slow: SessionStore = {
      ...store,
      read: async (id) => {
        await sleep(50);
        return store.read(id);
      },
    };

    const startedAt = performance.now();
    const outcome = await createRefresher(slow, redis, {
      now,
      pollIntervalMs: 1,
      waitBudgetMs: 100,
    }).ensureFresh(sid);
    const elapsed = performance.now() - startedAt;

    expect(outcome.kind).toBe("unavailable");
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("releasing the lock", () => {
  it("leaves a successor's lock alone", async () => {
    const sid = await store.create(expiringTokens());
    const lockKey = lockKeyFor(sid);

    respondToRefresh(async () => {
      // The holder is slow enough to lose its lock to the TTL, and a successor
      // takes the freed key before the holder gets its answer back.
      clock = new Date(clock.getTime() + LOCK_OUTLIVED_MS);
      await redis.set(lockKey, "successor", "PX", 5_000, "NX");
      return HttpResponse.json(rotated());
    });

    await refresher.ensureFresh(sid);

    expect(await redis.get(lockKey)).toBe("successor");
  });
});

describe("a refusal the session cannot come back from", () => {
  it("destroys the session and reports the revoked family", async () => {
    respondToRefresh(() =>
      HttpResponse.json(
        { title: "Unauthorized", status: 401, code: "refresh_token.reuse_detected" },
        { status: 401 },
      ),
    );
    const sid = await store.create(expiringTokens());

    const outcome = await refresher.ensureFresh(sid);

    expect(outcome.kind).toBe("destroyed");
    expect(outcome.kind === "destroyed" && outcome.familyRevoked).toBe(true);
    expect(await store.read(sid)).toBeNull();
  });

  it.each(["refresh_token.expired", "refresh_token.invalid", "refresh_token.user_not_found"])(
    "destroys the session without revoking a family for %s",
    async (code) => {
      respondToRefresh(() =>
        HttpResponse.json({ title: "Unauthorized", status: 401, code }, { status: 401 }),
      );
      const sid = await store.create(expiringTokens());

      const outcome = await refresher.ensureFresh(sid);

      expect(outcome.kind).toBe("destroyed");
      // The user is logged out either way, but only one of these means the
      // account was attacked, and the login screen says something different.
      expect(outcome.kind === "destroyed" && outcome.familyRevoked).toBe(false);
    },
  );
});

describe("a logout landing mid-exchange", () => {
  it("does not put the session back", async () => {
    const sid = await store.create(expiringTokens());

    respondToRefresh(() => {
      redis.forget(sessionKeyFor(sid));
      return HttpResponse.json(rotated());
    });

    const outcome = await refresher.ensureFresh(sid);

    expect(outcome.kind).toBe("no-session");
    expect(await store.read(sid)).toBeNull();
  });
});

describe("a transient failure", () => {
  it("leaves the session intact on a 503", async () => {
    respondToRefresh(() =>
      HttpResponse.json(
        { title: "Service Unavailable", status: 503 },
        { status: 503, headers: { "retry-after": "5" } },
      ),
    );
    const sid = await store.create(expiringTokens());

    const outcome = await refresher.ensureFresh(sid);

    expect(outcome.kind).toBe("unavailable");
    // An API outage must not sign anyone out - logging back in needs the same
    // API to be up.
    expect((await store.read(sid))?.refreshToken).toBe("refresh-original");
  });

  it("leaves the session intact when the request never completes", async () => {
    respondToRefresh(() => HttpResponse.error());
    const sid = await store.create(expiringTokens());

    const outcome = await refresher.ensureFresh(sid);

    expect(outcome.kind).toBe("unavailable");
    expect(await store.read(sid)).not.toBeNull();
  });

  it("releases the lock so a later request can try", async () => {
    respondToRefresh(() => HttpResponse.error());
    const sid = await store.create(expiringTokens());

    await refresher.ensureFresh(sid);

    expect(redis.keys()).not.toContain(lockKeyFor(sid));
  });
});

describe("forceRefresh", () => {
  it("rotates a token the clock still calls good", async () => {
    respondToRefresh(() => HttpResponse.json(rotated()));
    // Ten minutes left: nothing about this token looks stale, which is the case
    // a token-version bump produces.
    const sid = await store.create(tokens());

    const outcome = await refresher.forceRefresh(sid);

    expect(outcome.kind).toBe("refreshed");
    expect(exchanges).toBe(1);
  });
});

describe("no session at all", () => {
  it("makes no call", async () => {
    const outcome = await refresher.ensureFresh("never-issued");

    expect(outcome.kind).toBe("no-session");
    expect(exchanges).toBe(0);
  });
});
