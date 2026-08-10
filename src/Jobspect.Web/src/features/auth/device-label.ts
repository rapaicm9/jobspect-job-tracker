import { userAgentFromString } from "next/server";

/** The API's column limit. Exceeding it is a field error nobody can see or fix. */
const MAX_LENGTH = 128;

const UNKNOWN = "Unknown device";

/**
 * What the account will see in its list of signed-in devices.
 *
 * Derived on the server from the request's own header rather than sent by the
 * page: one BFF session is one refresh-token row, and the browser has no say in
 * how that row is named.
 *
 * **No version number.** "Chrome on Windows" survives an update; "Chrome 140 on
 * Windows" turns every browser update into what looks like a new device. The
 * label is meant to help someone recognise a session they started, which is a
 * question about the machine, not the build.
 */
export function deviceLabelFrom(userAgent: string | null | undefined): string {
  const { browser, os } = userAgentFromString(userAgent ?? undefined);

  const label = compose(browser.name, os.name);
  return label.length > MAX_LENGTH ? label.slice(0, MAX_LENGTH) : label;
}

function compose(browser: string | undefined, os: string | undefined): string {
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? UNKNOWN;
}
