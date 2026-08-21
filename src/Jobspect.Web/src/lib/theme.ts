/**
 * Which of the two palettes a visitor gets.
 *
 * Dark is the default and wins over the system setting, so `prefers-color-scheme`
 * is consulted nowhere - not in the token file, not here. Light is an opt-in the
 * settings screen will offer; until then this reads a value nothing writes, and
 * the only caller is the root layout.
 *
 * It has to be applied server-side, which is the whole reason it is a cookie
 * rather than anything the browser decides. A class set after first paint means
 * the page paints dark and then changes, and every element carrying
 * `transition-colors` animates through the gap - measurably, including through
 * contrast ratios that fail. Every page here already renders per request for the
 * CSP nonce, so the class costs one cookie read and no blocking inline script.
 *
 * Pure on purpose: reading the cookie needs a request, deciding what it means
 * does not.
 */

export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";

/**
 * No `__Host-` prefix, unlike the session and view cookies. That prefix pins a
 * cookie to `Secure`, which a test cannot seed over loopback, and what it buys
 * here is that a sibling subdomain cannot choose somebody's colour scheme. The
 * trade is not close.
 */
export const THEME_COOKIE = "jobspect.theme";

export const THEME_COOKIE_ATTRIBUTES = {
  // Only the server reads it, so nothing in the browser needs to.
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 365 * 24 * 60 * 60,
} as const;

/** Anything unreadable is the default: the user can edit this, so it is input. */
export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? DEFAULT_THEME;
}

/**
 * The class the root element carries. Dark is what the tokens paint with nothing
 * set, so it names no class of its own - an empty string here and a `.light`
 * block in the token file are the same decision seen from two sides.
 */
export function themeClass(theme: Theme): string {
  return theme === "light" ? "light" : "";
}
