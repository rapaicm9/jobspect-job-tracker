import "server-only";

import Redis, { type RedisOptions } from "ioredis";

/**
 * The commands this service issues, and nothing more.
 *
 * `ioredis` satisfies this structurally, so there is no adapter and no wrapper
 * class - but a test can hand the session store a few dozen lines of in-memory
 * fake instead of a container. That is what lets the store's key names and
 * command sequences be asserted in a suite that runs no containers.
 */
export interface RedisCommands {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, px: "PX", ttlMs: number): Promise<"OK" | null>;
  /** Claiming a lock: the caller that gets "OK" is the only one holding it. */
  set(key: string, value: string, px: "PX", ttlMs: number, nx: "NX"): Promise<"OK" | null>;
  /** Writing only while the key still exists, so a stale writer cannot recreate it. */
  set(key: string, value: string, px: "PX", ttlMs: number, xx: "XX"): Promise<"OK" | null>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  pexpire(key: string, ttlMs: number): Promise<number>;
  /**
   * Releasing a lock only if we still hold it. Fixed at one key and one
   * argument, which is the only script this service runs - a variadic signature
   * would describe commands nobody issues and leave the fake guessing.
   */
  eval(script: string, numKeys: 1, key: string, argument: string): Promise<unknown>;
  ping(): Promise<string>;
}

/** Aspire renders `.WithReference(cache)` into this. */
const CONNECTION_STRING_VARIABLE = "ConnectionStrings__cache";

/**
 * Translates the connection string Aspire injects into options `ioredis` accepts.
 *
 * The value arrives in StackExchange.Redis form - `host:port` followed by
 * comma-separated options - because that is what the .NET hosts consume. ioredis
 * takes a `redis://` URL, a host and port pair, or an options object, and refuses
 * a bare `host:port` string outright, so the value cannot simply be forwarded.
 * Both forms are handled here because the published topology is free to supply
 * either one.
 */
export function parseRedisConnectionString(value: string): RedisOptions {
  const trimmed = value.trim();

  if (trimmed === "") {
    throw new Error(`${CONNECTION_STRING_VARIABLE} is empty.`);
  }

  if (/^rediss?:\/\//.test(trimmed)) {
    return fromUrl(trimmed);
  }

  return fromStackExchangeForm(trimmed);
}

function fromUrl(value: string): RedisOptions {
  const url = new URL(value);
  const options: RedisOptions = {
    host: url.hostname,
    port: url.port === "" ? 6379 : Number(url.port),
  };

  if (url.password !== "") options.password = decodeURIComponent(url.password);
  if (url.username !== "") options.username = decodeURIComponent(url.username);
  if (url.protocol === "rediss:") options.tls = {};

  const db = url.pathname.replace(/^\//, "");
  if (db !== "") options.db = Number(db);

  return options;
}

function fromStackExchangeForm(value: string): RedisOptions {
  const [endpoint, ...settings] = value.split(",");

  // The endpoint is positional and every other segment is `key=value`, so a
  // first segment carrying an `=` means the string is not the shape assumed here.
  if (endpoint === undefined || endpoint.includes("=")) {
    throw new Error(
      `${CONNECTION_STRING_VARIABLE} does not start with a host:port endpoint: "${value}".`,
    );
  }

  const separator = endpoint.lastIndexOf(":");
  const host = separator === -1 ? endpoint : endpoint.slice(0, separator);
  const port = separator === -1 ? 6379 : Number(endpoint.slice(separator + 1));

  if (host === "" || !Number.isInteger(port)) {
    throw new Error(`${CONNECTION_STRING_VARIABLE} has an unusable endpoint: "${endpoint}".`);
  }

  const options: RedisOptions = { host, port };

  for (const setting of settings) {
    const split = setting.indexOf("=");
    if (split === -1) continue;

    const name = setting.slice(0, split).trim().toLowerCase();
    const settingValue = setting.slice(split + 1).trim();

    if (name === "password") options.password = settingValue;
    if (name === "user" || name === "username") options.username = settingValue;
    if (name === "ssl" && settingValue.toLowerCase() === "true") options.tls = {};
  }

  return options;
}

function connect(): RedisCommands {
  const connectionString = process.env[CONNECTION_STRING_VARIABLE];

  if (connectionString === undefined) {
    throw new Error(
      `${CONNECTION_STRING_VARIABLE} is not set. The AppHost supplies it; a bare \`next dev\` will not.`,
    );
  }

  return new Redis({
    ...parseRedisConnectionString(connectionString),

    // A session read that cannot reach Redis has to become a redirect to login
    // while the user is still watching, so the wait needs a bound. This is that
    // bound: a command is retried across one reconnect and then rejected, rather
    // than the twenty attempts the default allows.
    //
    // The offline queue stays on. Turning it off looks like the same idea but
    // fails the first request after startup, which races the connection rather
    // than outliving it.
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  });
}

// Every hot reload re-evaluates this module, and a client created at module
// scope would leak a connection per edit until the dev server runs out. The
// production build evaluates it once, so the cache is pure overhead there.
const CLIENT = Symbol.for("jobspect.web.redis");

type ClientHolder = { [CLIENT]?: RedisCommands };

let productionClient: RedisCommands | undefined;

export function getRedis(): RedisCommands {
  if (process.env.NODE_ENV === "production") {
    return (productionClient ??= connect());
  }

  const holder = globalThis as ClientHolder;
  return (holder[CLIENT] ??= connect());
}
