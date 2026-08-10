import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getRedis, type RedisCommands } from "@/server/redis";

/**
 * What the browser's cookie points at.
 *
 * Deliberately not the generated `AuthTokensResponse`: only `src/server/api/**`
 * may import the contract types, and this shape is structurally identical, so a
 * login or refresh response assigns straight into it with no mapper. Nothing
 * else lives here - the account's plan and timezone are read per request rather
 * than cached, because the session outlives a purchase by up to thirty days.
 */
export interface SessionTokens {
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface SessionStore {
  /** Returns the raw id, which goes in the cookie and is never stored. */
  create(tokens: SessionTokens): Promise<string>;
  read(sid: string): Promise<SessionTokens | null>;
  /** False when the session is gone, so a refresh cannot resurrect a logout. */
  replaceTokens(sid: string, tokens: SessionTokens): Promise<boolean>;
  destroy(sid: string): Promise<void>;
  /** The local half of `POST /identity/logout-all`. */
  destroyAllForUser(userId: string): Promise<void>;
}

export type Clock = () => Date;

const SESSION_PREFIX = "web:sess:";
const USER_INDEX_PREFIX = "web:sess:user:";

/**
 * The id is stored hashed, mirroring how the backend stores refresh tokens, so
 * a Redis dump yields nothing that can be replayed as a cookie. The user index
 * holds hashes for the same reason, which also means a logout-all can build the
 * session keys directly without reading anything back.
 */
export function hashSid(sid: string): string {
  return createHash("sha256").update(sid).digest("hex");
}

function sessionKey(hashed: string): string {
  return `${SESSION_PREFIX}${hashed}`;
}

function userIndexKey(userId: string): string {
  return `${USER_INDEX_PREFIX}${userId}`;
}

function remainingMs(tokens: SessionTokens, now: Date): number {
  const expiresAt = Date.parse(tokens.refreshTokenExpiresAt);

  if (Number.isNaN(expiresAt)) {
    throw new Error("Session tokens carry an unparseable refreshTokenExpiresAt.");
  }

  return expiresAt - now.getTime();
}

function isSessionTokens(value: unknown): value is SessionTokens {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.accessToken === "string" &&
    typeof candidate.accessTokenExpiresAt === "string" &&
    typeof candidate.refreshToken === "string" &&
    typeof candidate.refreshTokenExpiresAt === "string"
  );
}

export function createSessionStore(
  redis: RedisCommands,
  now: Clock = () => new Date(),
): SessionStore {
  async function readByHash(hashed: string): Promise<SessionTokens | null> {
    const raw = await redis.get(sessionKey(hashed));
    if (raw === null) return null;

    try {
      const parsed: unknown = JSON.parse(raw);
      // A value that is not a session is treated as no session rather than as an
      // error: whatever wrote it, the user cannot be served from it.
      return isSessionTokens(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return {
    async create(tokens) {
      const ttl = remainingMs(tokens, now());

      if (ttl <= 0) {
        throw new Error("Refusing to store a session whose refresh token has already expired.");
      }

      const sid = randomBytes(32).toString("base64url");
      const hashed = hashSid(sid);

      await redis.set(sessionKey(hashed), JSON.stringify(tokens), "PX", ttl);

      // Two writes rather than one, and not atomic with each other. Losing the
      // index entry costs a logout-all one session, which still expires on the
      // TTL above; the alternative is a Lua script the test fake would have to
      // interpret.
      await redis.sadd(userIndexKey(tokens.userId), hashed);
      await redis.pexpire(userIndexKey(tokens.userId), ttl);

      return sid;
    },

    read(sid) {
      return readByHash(hashSid(sid));
    },

    async replaceTokens(sid, tokens) {
      const ttl = remainingMs(tokens, now());
      if (ttl <= 0) return false;

      // XX rather than a read followed by a write: between the two, a logout on
      // another request would delete the key and this would put it back.
      const applied = await redis.set(
        sessionKey(hashSid(sid)),
        JSON.stringify(tokens),
        "PX",
        ttl,
        "XX",
      );

      if (applied === null) return false;

      await redis.pexpire(userIndexKey(tokens.userId), ttl);
      return true;
    },

    async destroy(sid) {
      const hashed = hashSid(sid);
      const tokens = await readByHash(hashed);

      await redis.del(sessionKey(hashed));

      if (tokens !== null) {
        await redis.srem(userIndexKey(tokens.userId), hashed);
      }
    },

    async destroyAllForUser(userId) {
      const indexKey = userIndexKey(userId);
      const hashes = await redis.smembers(indexKey);

      // Members outlive the sessions they name, since a set does not expire its
      // entries. Deleting a key that is already gone is a no-op, so a stale
      // member costs nothing.
      if (hashes.length > 0) {
        await redis.del(...hashes.map(sessionKey));
      }

      await redis.del(indexKey);
    },
  };
}

let store: SessionStore | undefined;

export function sessionStore(): SessionStore {
  return (store ??= createSessionStore(getRedis()));
}
