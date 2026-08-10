import type { RedisCommands } from "@/server/redis";
import { RELEASE_LOCK_SCRIPT } from "@/server/session/refresh";

/**
 * Enough Redis to run the session store: strings with a TTL, sets with a TTL,
 * and the conditional writes. Expiry is evaluated on access against the same
 * clock the store is given, so a test moves time rather than waiting for it.
 */
export interface FakeRedis extends RedisCommands {
  /** Every key and value currently held, for assertions about what was stored. */
  dump(): string;
  keys(): string[];
  /** Drops a key without touching the index that names it. */
  forget(key: string): void;
}

interface Entry<T> {
  value: T;
  expiresAt: number | null;
}

export function createFakeRedis(now: () => Date = () => new Date()): FakeRedis {
  const strings = new Map<string, Entry<string>>();
  const sets = new Map<string, Entry<Set<string>>>();

  function live<T>(store: Map<string, Entry<T>>, key: string): Entry<T> | undefined {
    const entry = store.get(key);
    if (entry === undefined) return undefined;

    if (entry.expiresAt !== null && entry.expiresAt <= now().getTime()) {
      store.delete(key);
      return undefined;
    }

    return entry;
  }

  return {
    async get(key) {
      return live(strings, key)?.value ?? null;
    },

    async set(key: string, value: string, _px: "PX", ttlMs: number, mode?: "NX" | "XX") {
      const existing = live(strings, key);

      if (mode === "NX" && existing !== undefined) return null;
      if (mode === "XX" && existing === undefined) return null;

      strings.set(key, { value, expiresAt: now().getTime() + ttlMs });
      return "OK";
    },

    async del(...keys) {
      let removed = 0;

      for (const key of keys) {
        if (live(strings, key) !== undefined || live(sets, key) !== undefined) removed += 1;
        strings.delete(key);
        sets.delete(key);
      }

      return removed;
    },

    async sadd(key, member) {
      const entry = live(sets, key) ?? { value: new Set<string>(), expiresAt: null };
      const added = entry.value.has(member) ? 0 : 1;

      entry.value.add(member);
      sets.set(key, entry);

      return added;
    },

    async srem(key, member) {
      const entry = live(sets, key);
      if (entry === undefined) return 0;

      return entry.value.delete(member) ? 1 : 0;
    },

    async smembers(key) {
      return [...(live(sets, key)?.value ?? [])];
    },

    async pexpire(key, ttlMs) {
      const entry = live(strings, key) ?? live(sets, key);
      if (entry === undefined) return 0;

      entry.expiresAt = now().getTime() + ttlMs;
      return 1;
    },

    async eval(script, _numKeys, key, argument) {
      // Matched by identity, not interpreted. This is not a Lua engine, and the
      // one script the service runs is exported so the match can be exact -
      // a rewritten script fails here rather than quietly doing nothing.
      if (script !== RELEASE_LOCK_SCRIPT) {
        throw new Error("The fake knows only the lock-release script.");
      }

      if (live(strings, key)?.value !== argument) return 0;

      strings.delete(key);
      return 1;
    },

    async ping() {
      return "PONG";
    },

    dump() {
      return JSON.stringify({
        strings: [...strings].map(([key, entry]) => [key, entry.value]),
        sets: [...sets].map(([key, entry]) => [key, [...entry.value]]),
      });
    },

    keys() {
      return [...strings.keys(), ...sets.keys()];
    },

    forget(key) {
      strings.delete(key);
      sets.delete(key);
    },
  };
}
