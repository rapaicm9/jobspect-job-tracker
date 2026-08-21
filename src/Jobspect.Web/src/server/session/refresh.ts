import "server-only";

import { randomBytes } from "node:crypto";

import { api, callApi } from "@/server/api/client";
import { getRedis, type RedisCommands } from "@/server/redis";
import {
  hashSid,
  sessionStore,
  type Clock,
  type SessionStore,
  type SessionTokens,
} from "@/server/session/store";

/**
 * Refresh this far ahead of expiry.
 *
 * The backend revokes an entire token family when a retired refresh token is
 * presented, and there is no grace window - so the expensive mistake is not a
 * refresh too early, it is two refreshes at once. Rotating ahead of expiry keeps
 * the reactive path rare, and the reactive path is what produces the burst of
 * simultaneous 401s that the lock below exists to serialise.
 */
const SKEW_MS = 60_000;

const LOCK_PREFIX = "web:lock:refresh:";
const LOCK_TTL_MS = 5_000;

/**
 * Deliberately tighter than the API client's shared 10s budget, which would let
 * an exchange outlive the lock guarding it and leave a second caller free to
 * start a second rotation. The client composes the caller's signal with its own
 * and honours whichever fires first, so passing this is enough to bound it.
 */
const EXCHANGE_BUDGET_MS = 3_000;

const POLL_INTERVAL_MS = 50;

/** Above the lock's TTL, so a winner that dies is outlived rather than raced. */
const WAIT_BUDGET_MS = LOCK_TTL_MS + 1_000;

/**
 * Release only what we still hold. A winner slow enough to lose its lock to the
 * TTL must not delete the lock its successor has since taken, or two rotations
 * run concurrently and the family is revoked.
 */
export const RELEASE_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export type RefreshOutcome =
  /** Valid already, or another request rotated it while this one waited. */
  | { kind: "fresh"; tokens: SessionTokens }
  | { kind: "refreshed"; tokens: SessionTokens }
  /** No record, or a logout landed while the exchange was in flight. */
  | { kind: "no-session" }
  /** Unrecoverable. Destroy the session and send the user to log in again. */
  | { kind: "destroyed"; familyRevoked: boolean }
  /** Transient: the API is down, unreachable, or another request is still at it. */
  | { kind: "unavailable" };

export interface Refresher {
  ensureFresh(sid: string): Promise<RefreshOutcome>;
  /** Ignores the skew. For a 401 on a token whose clock said it was still good. */
  forceRefresh(sid: string): Promise<RefreshOutcome>;
}

export interface RefresherOptions {
  now?: Clock;
  waitBudgetMs?: number;
  pollIntervalMs?: number;
}

export function exchangeRefreshToken(refreshToken: string) {
  return callApi(() =>
    api.POST("/api/v1/identity/refresh", {
      body: { refreshToken },
      signal: AbortSignal.timeout(EXCHANGE_BUDGET_MS),
    }),
  );
}

function isStale(tokens: SessionTokens, at: Date): boolean {
  const expiresAt = Date.parse(tokens.accessTokenExpiresAt);

  // An unreadable expiry counts as expired. Rotating costs one call; trusting it
  // costs a request that fails with nothing left to recover from.
  if (Number.isNaN(expiresAt)) return true;

  return expiresAt - at.getTime() <= SKEW_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRefresher(
  store: SessionStore,
  redis: RedisCommands,
  options: RefresherOptions = {},
): Refresher {
  const now = options.now ?? (() => new Date());
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const waitBudgetMs = options.waitBudgetMs ?? WAIT_BUDGET_MS;

  // Counted rather than timed. The clock this refresher holds moves in jumps so
  // a test can age a token, which makes it useless for measuring a real wait -
  // and a deadline read from it would never arrive. Each poll also costs a Redis
  // read, so the budget is a bound rather than a duration.
  const maxPolls = Math.max(1, Math.ceil(waitBudgetMs / pollIntervalMs));

  async function rotate(sid: string, refreshToken: string): Promise<RefreshOutcome> {
    const result = await exchangeRefreshToken(refreshToken);

    if (!result.ok) {
      if (result.failure.kind === "session-destroyed") {
        await store.destroy(sid);
        return { kind: "destroyed", familyRevoked: result.failure.familyRevoked };
      }

      // Everything else is transient, including a bodyless 401: this endpoint
      // takes no bearer and states every refusal with a code, so a 401 without
      // one says nothing about whether the refresh token is still good.
      return { kind: "unavailable" };
    }

    // False means a logout deleted the session while the exchange was in the
    // air. Honour it - writing the new tokens would put the session back.
    const applied = await store.replaceTokens(sid, result.data);
    return applied ? { kind: "refreshed", tokens: result.data } : { kind: "no-session" };
  }

  /**
   * Losing the lock means waiting for the holder's result, never producing one.
   * Presenting the same refresh token behind the holder is exactly what the
   * backend reads as a replayed token, and it answers by revoking every session
   * the account has. Re-contending after the wait would be the same move a
   * moment later, so this gives up instead and lets a later request, whose lock
   * is uncontested, recover.
   */
  async function waitForHolder(sid: string, staleToken: string): Promise<RefreshOutcome> {
    // Two bounds, because the poll count alone is not a duration. Each poll costs
    // a Redis read, so the loop takes `maxPolls * (interval + however long a read
    // takes)` - and at the ~400ms this Redis has been seen to answer in under
    // load, a budget meant to be six seconds becomes nearly a minute of somebody
    // watching a spinner. The count keeps the loop finite when reads are instant;
    // the deadline keeps it finite when they are not.
    //
    // `performance.now()` rather than the injected clock: that one jumps on
    // purpose so a test can age a token, which makes it useless for measuring a
    // real wait.
    const deadline = performance.now() + waitBudgetMs;

    for (let poll = 0; poll < maxPolls; poll += 1) {
      await sleep(pollIntervalMs);

      const current = await store.read(sid);
      if (current === null) return { kind: "no-session" };
      if (current.accessToken !== staleToken) return { kind: "fresh", tokens: current };

      // Checked after the read rather than before the sleep, so the wait always
      // costs at least one look at the store.
      if (performance.now() >= deadline) break;
    }

    return { kind: "unavailable" };
  }

  async function attempt(sid: string, force: boolean): Promise<RefreshOutcome> {
    const current = await store.read(sid);
    if (current === null) return { kind: "no-session" };

    if (!force && !isStale(current, now())) {
      return { kind: "fresh", tokens: current };
    }

    const lockKey = `${LOCK_PREFIX}${hashSid(sid)}`;
    const holder = randomBytes(16).toString("base64url");
    const won = await redis.set(lockKey, holder, "PX", LOCK_TTL_MS, "NX");

    // The lock is only ever taken by a caller that has decided to rotate, so
    // whoever holds it will produce a new token or destroy the session. That is
    // what makes waiting on it worthwhile rather than optimistic.
    if (won === null) return waitForHolder(sid, current.accessToken);

    try {
      return await rotate(sid, current.refreshToken);
    } finally {
      await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, holder);
    }
  }

  return {
    ensureFresh: (sid) => attempt(sid, false),
    forceRefresh: (sid) => attempt(sid, true),
  };
}

let refresher: Refresher | undefined;

export function sessionRefresher(): Refresher {
  return (refresher ??= createRefresher(sessionStore(), getRedis()));
}

export function ensureFreshToken(sid: string): Promise<RefreshOutcome> {
  return sessionRefresher().ensureFresh(sid);
}

export function forceRefreshToken(sid: string): Promise<RefreshOutcome> {
  return sessionRefresher().forceRefresh(sid);
}
