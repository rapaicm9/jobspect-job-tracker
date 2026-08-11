/**
 * Plain calendar dates, which is what the API sends for an applied date or a
 * deadline: `format: date`, no time and no zone.
 *
 * They are deliberately not routed through the account-zone helper the reminder
 * instants use. There is no instant here to place in a zone - the day someone
 * applied is the day they applied, wherever anybody reads it later - and putting
 * one through a conversion is how it becomes the day before.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * UTC on purpose, and load-bearing.
 *
 * `new Date("2026-08-11")` is parsed as midnight UTC, so formatting it anywhere
 * behind UTC renders the 10th. Pinning the formatter to UTC undoes exactly the
 * shift that parsing introduced.
 */
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "11 Aug 2026", or null for a date the API did not send or we cannot read. */
export function formatDate(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  return formatter.format(parsed);
}
