import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { api, setAccessTokenProvider } from "@/server/api/client";
import { createAuthenticatedCaller, type AuthenticatedCaller } from "@/server/session/call";
import { createRefresher } from "@/server/session/refresh";
import { createSessionStore, type SessionStore, type SessionTokens } from "@/server/session/store";

import { createFakeRedis, type FakeRedis } from "./fake-redis";

const BASE = "http://api.test";
const ACCOUNT_URL = `${BASE}/api/v1/account`;
const REFRESH_URL = `${BASE}/api/v1/identity/refresh`;
const DAY_MS = 24 * 60 * 60 * 1000;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  setAccessTokenProvider(async () => null);
});
afterAll(() => server.close());

let clock: Date;
const now = () => clock;

let redis: FakeRedis;
let store: SessionStore;
let call: AuthenticatedCaller;
let exchanges: number;
let bearers: (string | null)[];

function tokens(overrides: Partial<SessionTokens> = {}): SessionTokens {
  return {
    userId: "01997a1e-0000-7000-8000-000000000001",
    accessToken: "access-original",
    // Ten minutes left. Nothing here looks stale, which is the whole point: a
    // token version bump invalidates a token the clock still calls good.
    accessTokenExpiresAt: new Date(clock.getTime() + 10 * 60 * 1000).toISOString(),
    refreshToken: "refresh-original",
    refreshTokenExpiresAt: new Date(clock.getTime() + 30 * DAY_MS).toISOString(),
    ...overrides,
  };
}

const getAccount = (sid: string) => call(sid, (init) => api.GET("/api/v1/account", init));

/** The bodyless 401: no code, no body, and the only one refreshing repairs. */
const staleTokenResponse = () => new HttpResponse(null, { status: 401 });

function respondToAccount(...responses: (() => Response)[]) {
  let attempt = 0;

  server.use(
    http.get(ACCOUNT_URL, ({ request }) => {
      bearers.push(request.headers.get("authorization"));
      const respond = responses[Math.min(attempt, responses.length - 1)];
      attempt += 1;
      return respond();
    }),
  );
}

function respondToRefresh() {
  server.use(
    http.post(REFRESH_URL, () => {
      exchanges += 1;
      return HttpResponse.json(tokens({ accessToken: "access-rotated" }));
    }),
  );
}

beforeEach(() => {
  clock = new Date("2026-08-10T12:00:00.000Z");
  redis = createFakeRedis(now);
  store = createSessionStore(redis, now);
  call = createAuthenticatedCaller(createRefresher(store, redis, { now, pollIntervalMs: 10 }));
  exchanges = 0;
  bearers = [];
});

describe("a call that succeeds", () => {
  it("refreshes nothing", async () => {
    respondToAccount(() =>
      HttpResponse.json({
        userId: "01997a1e-0000-7000-8000-000000000001",
        email: "someone@example.com",
        timeZoneId: "Europe/Belgrade",
        createdAt: clock.toISOString(),
      }),
    );
    const sid = await store.create(tokens());

    const result = await getAccount(sid);

    expect(result.ok).toBe(true);
    expect(exchanges).toBe(0);
    expect(bearers).toHaveLength(1);
  });
});

describe("a stale token", () => {
  it("is refreshed once and the call retried once", async () => {
    respondToRefresh();
    respondToAccount(staleTokenResponse, () =>
      HttpResponse.json({
        userId: "01997a1e-0000-7000-8000-000000000001",
        email: "someone@example.com",
        timeZoneId: "Europe/Belgrade",
        createdAt: clock.toISOString(),
      }),
    );
    const sid = await store.create(tokens());

    const result = await getAccount(sid);

    expect(result.ok).toBe(true);
    expect(exchanges).toBe(1);
    // The retry carries the rotated token on the request itself. Asking the
    // provider again would hand back the memoised token that just failed.
    expect(bearers).toEqual([null, "Bearer access-rotated"]);
  });

  it("gives up rather than looping when the retry is stale too", async () => {
    respondToRefresh();
    respondToAccount(staleTokenResponse);
    const sid = await store.create(tokens());

    const result = await getAccount(sid);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("token-stale");
    expect(bearers).toHaveLength(2);
    expect(exchanges).toBe(1);
  });

  it("is not retried when the refresh cannot recover the session", async () => {
    server.use(
      http.post(REFRESH_URL, () => {
        exchanges += 1;
        return HttpResponse.json(
          { title: "Unauthorized", status: 401, code: "refresh_token.reuse_detected" },
          { status: 401 },
        );
      }),
    );
    respondToAccount(staleTokenResponse);
    const sid = await store.create(tokens());

    const result = await getAccount(sid);

    expect(!result.ok && result.failure.kind).toBe("token-stale");
    expect(bearers).toHaveLength(1);
    expect(await store.read(sid)).toBeNull();
  });
});

describe("a failure refreshing cannot fix", () => {
  it("comes straight back", async () => {
    respondToAccount(() =>
      HttpResponse.json(
        { title: "Unauthorized", status: 401, code: "auth.user_not_found" },
        { status: 401 },
      ),
    );
    const sid = await store.create(tokens());

    const result = await getAccount(sid);

    expect(!result.ok && result.failure.kind).toBe("session-destroyed");
    expect(exchanges).toBe(0);
    expect(bearers).toHaveLength(1);
  });
});

// The refresh call is made by the access-token provider, so routing it back
// through the provider would recurse without bound. The skip is what breaks
// that, and it also keeps a dead token from being offered to login.
describe("the anonymous endpoints", () => {
  const anonymous = [
    ["register", () => api.POST("/api/v1/identity/register", { body: {} as never })],
    ["login", () => api.POST("/api/v1/identity/login", { body: {} as never })],
    ["refresh", () => api.POST("/api/v1/identity/refresh", { body: {} as never })],
  ] as const;

  it.each(anonymous)("send no bearer to %s", async (name, send) => {
    setAccessTokenProvider(async () => "must-not-be-sent");

    let seen: string | null = "unset";
    server.use(
      http.post(`${BASE}/api/v1/identity/${name}`, ({ request }) => {
        seen = request.headers.get("authorization");
        return HttpResponse.json({});
      }),
    );

    await send();

    expect(seen).toBeNull();
  });

  it("do not stop an authenticated endpoint being signed", async () => {
    setAccessTokenProvider(async () => "a-real-token");
    respondToAccount(() => HttpResponse.json({}));

    await api.GET("/api/v1/account");

    expect(bearers).toEqual(["Bearer a-real-token"]);
  });
});
