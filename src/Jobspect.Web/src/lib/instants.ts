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

const displayFormatters = new Map<string, Intl.DateTimeFormat>();
const partFormatters = new Map<string, Intl.DateTimeFormat>();

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
 *
 * Both caches go through here so reading an instant and writing one cannot end up
 * disagreeing about which zone they meant.
 */
function formatterFor(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZoneId: string | null,
  build: (timeZone: string) => Intl.DateTimeFormat,
): Intl.DateTimeFormat {
  const zone = timeZoneId ?? "UTC";

  const existing = cache.get(zone);
  if (existing !== undefined) return existing;

  let formatter;
  try {
    formatter = build(zone);
  } catch {
    formatter = build("UTC");
  }

  cache.set(zone, formatter);
  return formatter;
}

function buildDisplay(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The numbers rather than a sentence, which is what both conversions below read.
 *
 * `hourCycle: "h23"` rather than `hour12: false`, because that pair is not the
 * same question: midnight comes back as hour 24 under some data with the latter,
 * and an hour of 24 read back as a wall clock is a day out.
 */
function buildParts(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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

  return formatterFor(displayFormatters, timeZoneId, buildDisplay).format(parsed);
}

/**
 * The zone these conversions actually use, which is UTC whenever the account's is
 * missing or unusable.
 *
 * Worth asking rather than reading `timeZoneId` directly: a form that names the
 * zone it is interpreting times in must not name one it then quietly did not use.
 */
export function accountZone(timeZoneId: string | null): string {
  return formatterFor(partFormatters, timeZoneId, buildParts).resolvedOptions().timeZone;
}

/**
 * What day it is where the account is, as `YYYY-MM-DD`.
 *
 * The one calendar question that genuinely needs a zone. `lib/dates.ts` formats a
 * date without one because the day someone applied is that day wherever it is
 * read - but whether a deadline is *near* compares it to now, and now is a
 * different date either side of most zone boundaries for several hours a day.
 */
export function todayInZone(timeZoneId: string | null, at: number = Date.now()): string {
  const { year, month, day } = partsAt(at, timeZoneId);

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What the clock in the account's zone read at that instant. */
function partsAt(instant: number, timeZoneId: string | null): ZonedParts {
  const parts = formatterFor(partFormatters, timeZoneId, buildParts).formatToParts(
    new Date(instant),
  );

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/**
 * The clock reading at that instant, as though the zone's own wall clock were
 * UTC. Comparable, which is the only thing it is for.
 */
function wallClockAt(instant: number, timeZoneId: string | null): number {
  const { year, month, day, hour, minute, second } = partsAt(instant, timeZoneId);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/**
 * How far ahead of UTC the account's zone was at that instant, in milliseconds.
 *
 * Read off the zone rather than computed, because an offset is a fact about a
 * moment and not about a zone: the same zone is two different numbers either side
 * of a daylight-saving change, and which one applies is exactly what this asks.
 */
function offsetAt(instant: number, timeZoneId: string | null): number {
  // The parts carry no milliseconds, so the two sides are compared at whole
  // seconds. Flooring rather than truncating, which rounds the wrong way before
  // 1970.
  return wallClockAt(instant, timeZoneId) - Math.floor(instant / 1000) * 1000;
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * An instant as the wall clock an account would have seen: `2026-08-20T09:00`,
 * which is what `<input type="datetime-local">` binds to. Null for an instant we
 * cannot read, the same answer `formatInAccountZone` gives.
 */
export function toZonedInput(
  value: string | null | undefined,
  timeZoneId: string | null,
): string | null {
  if (typeof value !== "string") return null;

  const instant = new Date(value).getTime();
  if (Number.isNaN(instant)) return null;

  const { year, month, day, hour, minute } = partsAt(instant, timeZoneId);

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}`;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * A wall clock the user typed, back into the instant the API stores.
 *
 * A wall clock does not name an instant on its own: it needs the zone's offset,
 * and the offset is a fact about the instant being worked out. So both offsets
 * the day either side of it can carry are tried, and the one that actually reads
 * back as the time the user typed wins. A single pass gets the ordinary case
 * right and the far side of a daylight-saving change an hour wrong.
 *
 * Twice a year a wall clock has no single answer, and each case is resolved
 * rather than refused - neither is discoverable from the result, and an interview
 * genuinely does get scheduled at one of them:
 *
 * - The hour daylight saving skips never happens. Nothing reads back, so the
 *   later candidate is taken and 02:30 comes out as 03:30 - forward by the jump,
 *   which is where the rest of that day's appointments moved too.
 * - The hour it repeats happens twice. Both read back, and the first is taken,
 *   because somebody entering a time during a repeated hour means the one that
 *   comes first.
 */
export function fromZonedInput(local: string, timeZoneId: string | null): string | null {
  const parsed = WALL_CLOCK.exec(local);
  if (parsed === null) return null;

  const [, year, month, day, hour, minute, second] = parsed;
  const wanted = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
  );
  if (Number.isNaN(wanted)) return null;

  // A day either side brackets any single transition, and no zone has two in one
  // day. They collapse to one candidate everywhere except across a change.
  const candidates = [
    ...new Set([
      wanted - offsetAt(wanted - DAY, timeZoneId),
      wanted - offsetAt(wanted + DAY, timeZoneId),
    ]),
  ];

  const real = candidates.filter((instant) => wallClockAt(instant, timeZoneId) === wanted);
  const chosen = real.length > 0 ? Math.min(...real) : Math.max(...candidates);

  return new Date(chosen).toISOString();
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
