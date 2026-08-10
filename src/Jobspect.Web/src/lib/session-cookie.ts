/**
 * The cookie's definition, in one place because two layers write it: the
 * session layer sets it at login, and `proxy.ts` re-stamps its expiry on every
 * request. Deliberately free of `next/headers` - the proxy runs before the
 * render and cannot use it.
 *
 * The `__Host-` prefix is a browser-enforced contract: a cookie carrying it is
 * rejected unless it is `Secure`, has `Path=/`, and names no `Domain`. That last
 * one is the reason to want it - without it, anything able to write a cookie on
 * a sibling subdomain could write one this service would read.
 *
 * The `Secure` requirement does not make local development awkward, because
 * browsers treat loopback as a trustworthy origin and waive the https check.
 */
export const SESSION_COOKIE = "__Host-jobspect.sid";

/**
 * Matches the API's `RefreshTokenLifetime`, which is what the cookie is
 * ultimately pointing at. Rotation slides that expiry on every use, so the
 * cookie is re-stamped per request rather than fixed at the moment of login -
 * otherwise a daily user is signed out thirty days after their first visit.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  // Lax rather than Strict: Strict drops the cookie on a top-level navigation
  // in from elsewhere, so following a link back into the app would land on the
  // login page. Server Actions carry their own CSRF defence.
  sameSite: "lax",
  path: "/",
} as const;
