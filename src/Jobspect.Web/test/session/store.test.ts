import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { createSessionStore, type SessionTokens } from "@/server/session/store";

import { createFakeRedis, type FakeRedis } from "./fake-redis";

const DAY_MS = 24 * 60 * 60 * 1000;

let clock: Date;
const now = () => clock;

let redis: FakeRedis;
let store: ReturnType<typeof createSessionStore>;

function tokens(overrides: Partial<SessionTokens> = {}): SessionTokens {
  return {
    userId: "01997a1e-0000-7000-8000-000000000001",
    accessToken: "access-token-value",
    accessTokenExpiresAt: new Date(clock.getTime() + 10 * 60 * 1000).toISOString(),
    refreshToken: "refresh-token-value",
    refreshTokenExpiresAt: new Date(clock.getTime() + 30 * DAY_MS).toISOString(),
    ...overrides,
  };
}

function sessionKeyFor(sid: string): string {
  return `web:sess:${createHash("sha256").update(sid).digest("hex")}`;
}

beforeEach(() => {
  clock = new Date("2026-08-09T12:00:00.000Z");
  redis = createFakeRedis(now);
  store = createSessionStore(redis, now);
});

describe("create", () => {
  it("round-trips every field", async () => {
    const written = tokens();
    const sid = await store.create(written);

    expect(await store.read(sid)).toEqual(written);
  });

  it("keys the session by the hash of the id", async () => {
    const sid = await store.create(tokens());

    expect(redis.keys()).toContain(sessionKeyFor(sid));
  });

  it("stores nothing that can be replayed as a cookie", async () => {
    const sid = await store.create(tokens());

    // Neither as a key nor inside a value: the hash is what is kept, so a dump
    // of the store yields nothing that could be presented as a session id.
    expect(redis.dump()).not.toContain(sid);
  });

  it("expires the session when the refresh token does", async () => {
    const sid = await store.create(tokens());

    clock = new Date(clock.getTime() + 30 * DAY_MS - 1000);
    expect(await store.read(sid)).not.toBeNull();

    clock = new Date(clock.getTime() + 2000);
    expect(await store.read(sid)).toBeNull();
  });

  it("refuses tokens that have already expired", async () => {
    const expired = tokens({
      refreshTokenExpiresAt: new Date(clock.getTime() - 1000).toISOString(),
    });

    await expect(store.create(expired)).rejects.toThrow(/already expired/i);
    expect(redis.keys()).toHaveLength(0);
  });

  it("refuses tokens whose expiry cannot be read", async () => {
    await expect(store.create(tokens({ refreshTokenExpiresAt: "soon" }))).rejects.toThrow(
      /unparseable/i,
    );
  });

  it("mints a different id each time", async () => {
    const first = await store.create(tokens());
    const second = await store.create(tokens());

    expect(first).not.toEqual(second);
  });
});

describe("read", () => {
  it("returns null for an id that was never issued", async () => {
    expect(await store.read("not-a-session")).toBeNull();
  });

  it("returns null rather than throwing when the stored value is not a session", async () => {
    const sid = await store.create(tokens());
    await redis.set(sessionKeyFor(sid), "{ not json", "PX", DAY_MS);

    expect(await store.read(sid)).toBeNull();
  });

  it("returns null when the stored value is missing a field", async () => {
    const sid = await store.create(tokens());
    await redis.set(sessionKeyFor(sid), JSON.stringify({ userId: "u" }), "PX", DAY_MS);

    expect(await store.read(sid)).toBeNull();
  });
});

describe("replaceTokens", () => {
  it("rewrites the tokens and keeps the user", async () => {
    const original = tokens();
    const sid = await store.create(original);

    const refreshed = tokens({
      accessToken: "second-access-token",
      refreshToken: "second-refresh-token",
    });

    expect(await store.replaceTokens(sid, refreshed)).toBe(true);

    const stored = await store.read(sid);
    expect(stored?.accessToken).toBe("second-access-token");
    expect(stored?.refreshToken).toBe("second-refresh-token");
    expect(stored?.userId).toBe(original.userId);
  });

  it("slides the expiry forward", async () => {
    const sid = await store.create(tokens());

    clock = new Date(clock.getTime() + 20 * DAY_MS);
    await store.replaceTokens(sid, tokens());

    // Past where the original TTL would have ended.
    clock = new Date(clock.getTime() + 15 * DAY_MS);
    expect(await store.read(sid)).not.toBeNull();
  });

  it("does not resurrect a session that was destroyed", async () => {
    const sid = await store.create(tokens());
    await store.destroy(sid);

    expect(await store.replaceTokens(sid, tokens())).toBe(false);
    expect(await store.read(sid)).toBeNull();
  });

  it("refuses tokens that have already expired", async () => {
    const sid = await store.create(tokens());

    const expired = tokens({
      refreshTokenExpiresAt: new Date(clock.getTime() - 1000).toISOString(),
    });

    expect(await store.replaceTokens(sid, expired)).toBe(false);
    expect(await store.read(sid)).not.toBeNull();
  });
});

describe("destroy", () => {
  it("removes the session and its place in the user index", async () => {
    const sid = await store.create(tokens());
    await store.destroy(sid);

    expect(await store.read(sid)).toBeNull();
    expect(redis.dump()).not.toContain(sessionKeyFor(sid).replace("web:sess:", ""));
  });

  it("is silent about an id that was never issued", async () => {
    await expect(store.destroy("not-a-session")).resolves.toBeUndefined();
  });
});

describe("destroyAllForUser", () => {
  it("removes every session that user holds", async () => {
    const first = await store.create(tokens());
    const second = await store.create(tokens());

    await store.destroyAllForUser(tokens().userId);

    expect(await store.read(first)).toBeNull();
    expect(await store.read(second)).toBeNull();
  });

  it("leaves another account's sessions alone", async () => {
    const mine = await store.create(tokens());
    const theirs = await store.create(tokens({ userId: "01997a1e-0000-7000-8000-000000000002" }));

    await store.destroyAllForUser(tokens().userId);

    expect(await store.read(mine)).toBeNull();
    expect(await store.read(theirs)).not.toBeNull();
  });

  it("survives an index entry whose session is already gone", async () => {
    const stale = await store.create(tokens());
    const live = await store.create(tokens());

    // A set does not expire its members, so the index outlives what it names.
    redis.forget(sessionKeyFor(stale));

    await expect(store.destroyAllForUser(tokens().userId)).resolves.toBeUndefined();
    expect(await store.read(live)).toBeNull();
  });

  it("is silent about a user with no sessions", async () => {
    await expect(store.destroyAllForUser("nobody")).resolves.toBeUndefined();
  });
});
