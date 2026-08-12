/**
 * How the list is shown, which is a preference rather than state.
 *
 * It lives in a cookie rather than the URL: the URL owns what is being looked at
 * - filters, sort, campaign - so that a link carries it, and nobody wants to
 * send someone a link that also changes their row height. §6.3's rule that the
 * cursor never enters the URL is the same principle from the other side.
 *
 * Pure on purpose. Reading the cookie needs a request; deciding what it means
 * does not, and keeping them apart is what makes the parser testable.
 */

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

/**
 * The two §17.3 puts behind the toggle, hidden by default. Nine columns is more
 * than the primary screen can carry, and these are the two nobody scans.
 */
export const OPTIONAL_COLUMNS = ["workMode", "location"] as const;
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

export interface ViewPreferences {
  density: Density;
  hidden: readonly OptionalColumn[];
}

export const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  // The comfortable row clears the coarse-pointer target floor without help.
  // Compact is a choice someone makes, not one made for them.
  density: "comfortable",
  hidden: OPTIONAL_COLUMNS,
};

export const VIEW_COOKIE = "__Host-jobspect.view";

/**
 * Only the server reads this, so it is closed to script for the same reason the
 * session cookie is. The `__Host-` prefix costs nothing and rules out a sibling
 * subdomain writing preferences this app would honour.
 */
export const VIEW_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 365 * 24 * 60 * 60,
} as const;

function isDensity(value: string | null): value is Density {
  return DENSITIES.some((density) => density === value);
}

function isOptionalColumn(value: string): value is OptionalColumn {
  return OPTIONAL_COLUMNS.some((column) => column === value);
}

/**
 * Every field is validated and anything unreadable falls back to the default.
 *
 * The user can edit this cookie, so a value out of it is input rather than
 * something we wrote - a density of "tiny" or a column that no longer exists has
 * to render a list rather than a stack trace.
 */
export function parseViewPreferences(value: string | null | undefined): ViewPreferences {
  if (typeof value !== "string" || value === "") return DEFAULT_VIEW_PREFERENCES;

  const parsed = new URLSearchParams(value);
  const density = parsed.get("density");
  const hidden = parsed.get("hidden");

  return {
    density: isDensity(density) ? density : DEFAULT_VIEW_PREFERENCES.density,
    // An absent `hidden` is not an empty one: the cookie is only written by the
    // form, and a form that showed both columns writes an empty value rather
    // than dropping the key.
    hidden:
      hidden === null
        ? DEFAULT_VIEW_PREFERENCES.hidden
        : hidden.split(",").filter((column) => isOptionalColumn(column)),
  };
}

export function serialiseViewPreferences(preferences: ViewPreferences): string {
  return new URLSearchParams({
    density: preferences.density,
    hidden: preferences.hidden.join(","),
  }).toString();
}

export function isColumnVisible(preferences: ViewPreferences, column: OptionalColumn): boolean {
  return !preferences.hidden.includes(column);
}
