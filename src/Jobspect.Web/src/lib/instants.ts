/**
 * Instants, which is what the API sends for anything that happened at a moment
 * rather than on a day: `format: date-time`, always UTC on the wire.
 *
 * Read in the account's own zone rather than the browser's. The account states
 * one and the backend computes reminder instants from it, so a browser that
 * disagrees would show an interview at a time no reminder will ever fire at.
 * `lib/dates.ts` holds the other half - calendar dates, which have no instant to
 * place and are deliberately not routed through here.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The locale is fixed for the reason `formatMoney`'s is: there is no i18n
 * framework here, so one language and one date shape throughout.
 */
const LOCALE = "en-GB";

/**
 * UTC when the account's zone is unusable, which covers two cases.
 *
 * A null zone means the account could not be read, and an unrecognised one means
 * a zone this runtime has no data for - `Intl` throws `RangeError` on it rather
 * than falling back. UTC is the honest answer to both: it is what the instant is
 * stored in, so the reader sees the value the API holds rather than a time
 * shifted into somebody else's zone.
 */
function formatterFor(timeZoneId: string | null): Intl.DateTimeFormat {
  const zone = timeZoneId ?? "UTC";

  const existing = formatters.get(zone);
  if (existing !== undefined) return existing;

  let formatter;
  try {
    formatter = build(zone);
  } catch {
    formatter = build("UTC");
  }

  formatters.set(zone, formatter);
  return formatter;
}

function build(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "11 Aug 2026, 09:30", or null for an instant we cannot read. */
export function formatInAccountZone(
  value: string | null | undefined,
  timeZoneId: string | null,
): string | null {
  if (typeof value !== "string") return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return formatterFor(timeZoneId).format(parsed);
}
