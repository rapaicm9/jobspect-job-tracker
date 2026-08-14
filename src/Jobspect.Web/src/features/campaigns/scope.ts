import { parseAsString } from "nuqs/server";

/**
 * The campaign a screen is being read through.
 *
 * A context rather than a filter: a campaign is a whole job search, so it spans
 * Board, Applications and Analytics rather than narrowing one of them. That is
 * why it lives beside the nav and not in the list's filter bar - and why it is
 * in the URL, so a link carries which search is being looked at.
 *
 * It deliberately does not scope Reminders, which are about instants rather than
 * applications, or the weekly goal, which ADR 0016 puts across the account.
 */
export const campaignScopeParsers = {
  // Parsed as a plain string: an id is opaque to this client, and the API
  // refuses one it does not own. Validating a UUID shape here would only reject
  // earlier what the server rejects better, and with a worse message.
  campaignId: parseAsString,
};

/**
 * Set from two places - the switcher and the palette - so the option lives with
 * the parser rather than at each call site.
 *
 * `shallow: false` is what makes the server re-render with the new scope; the
 * default would move the address bar and leave the list where it was. Switching
 * keeps the stage filter and the sort, because those describe how a list is
 * being read rather than which list it is.
 */
export const campaignScopeOptions = { shallow: false } as const;

/** The paths a campaign is a context for. Reminders and Settings are not. */
export const SCOPED_PATHS = ["/board", "/applications", "/analytics"];

export function isScopedPath(pathname: string): boolean {
  return SCOPED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Stamps the scope onto a link, so a navigation carries the context it was made
 * in. Without it a `<Link>` drops every parameter its href does not state, and
 * moving between two scoped screens quietly reverts to the default campaign.
 *
 * A bare href when the scope is absent: an absent parameter already means the
 * default campaign, so stamping the default's id would repeat what the URL says.
 */
export function withCampaignScope(href: string, campaignId: string | null): string {
  if (campaignId === null) return href;

  // Split first, because isScopedPath answers about a pathname. It also leaves an
  // href that already carries filters intact rather than replacing them.
  const [path = "", query = ""] = href.split("?");
  if (!isScopedPath(path)) return href;

  const params = new URLSearchParams(query);
  params.set("campaignId", campaignId);

  return `${path}?${params.toString()}`;
}
