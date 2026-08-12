// The ports the authenticated suite binds, in one place because two files read
// them: playwright.auth.config.ts hands them to the three processes, and the
// specs open a Redis client against one.
//
// Deliberately clear of the ordinary suite's 3100. With reuseExistingServer on
// locally, a shared port would let this suite silently adopt a Next server the
// other config started - one pointed at http://api.test, with no Redis behind
// it - and the failure would look like a session bug rather than a stale server.

export const WEB_PORT = 3200;
export const FAKE_API_PORT = 3201;
export const REDIS_PORT = 6390;

// Loopback rather than localhost: it resolves without touching the resolver, and
// browsers treat it as a trustworthy origin, which the __Host- cookie needs.
export const WEB_ORIGIN = `http://127.0.0.1:${String(WEB_PORT)}`;
export const FAKE_API_ORIGIN = `http://127.0.0.1:${String(FAKE_API_PORT)}`;
export const REDIS_URL = `redis://127.0.0.1:${String(REDIS_PORT)}`;

/** Named so a stray container is identifiable rather than just a bound port. */
export const REDIS_CONTAINER = "jobspect-web-e2e-redis";
