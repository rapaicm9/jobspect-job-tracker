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

function midnightUtc(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00Z`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days from one calendar date to another - negative for a date already
 * past, zero for the same day. Null if either side is not a date.
 *
 * Both sides are read at midnight UTC, which is what makes the subtraction exact:
 * two calendar dates have no zone between them, so an hour of daylight saving
 * cannot round the answer down. Which day "today" is *does* depend on a zone, and
 * that question belongs to `todayInZone` in instants.ts - the caller answers it
 * there and hands the result in here.
 */
export function daysUntil(
  date: string | null | undefined,
  today: string | null | undefined,
): number | null {
  const target = midnightUtc(date);
  const from = midnightUtc(today);
  if (target === null || from === null) return null;

  return Math.round((target - from) / DAY);
}
