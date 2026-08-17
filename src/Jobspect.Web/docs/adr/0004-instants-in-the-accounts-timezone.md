# 0004 — Instants are read and written in the account's timezone

- **Status:** Accepted
- **Date:** 2026-08-18

## Context

The API carries two kinds of temporal value. A calendar date — an applied date, a deadline — is
`format: date`, has no instant behind it, and travels as the `yyyy-mm-dd` that
`<input type="date">` already produces. An instant is `format: date-time`, always UTC on the wire,
and has to be placed in some zone before a person can read it.

Which zone is not a preference. `AccountResponse.timeZoneId` holds an IANA identifier the account
states, and the backend computes reminder instants from it: an interview scheduled at 09:00 gets a
reminder an hour before _in that zone_. A client that renders the same instant in the browser's zone
shows a time no reminder will ever fire at, and the two disagree silently for anybody travelling,
anybody who moved, and anybody whose machine is simply set wrong.

Reading is the easy half — `Intl.DateTimeFormat` takes a `timeZone` option. Writing is not.
`<input type="datetime-local">` hands over a wall clock with no zone attached, and turning
`2026-08-20T09:00` into an instant requires the zone's offset **at that moment**, which is the thing
being worked out. The offset is also not a property of the zone: it moves at every daylight-saving
change, so a single reading of it is right on one side of the boundary and an hour wrong on the
other.

Twice a year a wall clock has no single answer at all. The hour daylight saving skips never happens;
the hour it repeats happens twice.

## Decision

**Every instant this client reads or writes is placed in the account's zone, through
`src/lib/instants.ts` and nowhere else.** `formatInAccountZone` reads one, `toZonedInput` turns one
into the wall clock a control binds to, and `fromZonedInput` turns a typed wall clock back into an
instant. Nothing calls `toLocaleString()` with browser defaults, and no component does its own
arithmetic. `src/lib/dates.ts` keeps the calendar dates, which have no instant to place and are
deliberately not routed through here.

**An unusable zone falls back to UTC, in both directions.** A null zone means the account could not
be read; an unrecognised one means a runtime with no data for it, and `Intl` throws `RangeError`
rather than degrading, so one bad identifier would otherwise take a screen down. UTC is the honest
answer to both: it is what the instant is stored in, so the reader sees the value the API holds
rather than a time shifted into somebody else's zone. Formatters are cached per zone, the failed one
included, so the throw happens once. A form that names the zone it is interpreting times in asks
which zone was actually used rather than printing the identifier it was given.

**The offset is read at the instant, not at the zone.** Both offsets the day either side of a wall
clock can carry are tried, and the candidate that reads back as the time the user typed wins.

**The two ambiguous hours are resolved rather than refused**, and each rule is pinned by a test
because neither is discoverable from the result:

| Case                           | Resolution                                                                  |
| ------------------------------ | --------------------------------------------------------------------------- |
| The hour daylight saving skips | Forward by the jump — 02:30 becomes 03:30, where the rest of that day moved |
| The hour it repeats            | The first of the two                                                        |

**This is hand-rolled rather than taken from a library.** It is two pure functions over
`Intl.DateTimeFormat.formatToParts`, and the alternative is a runtime dependency in a client bundle
for arithmetic that is testable to the transition minute without one.

**`hourCycle: "h23"`, never `hour12: false`.** They are not the same request: the latter reports
midnight as hour 24 under some data, and an hour of 24 read back as a wall clock is a day out.

## Consequences

- Every screen showing an instant needs the account, which the shell already reads and memoises.
- A zone the runtime does not recognise degrades to UTC rather than failing, so a wrong-looking time
  is possible where a broken page is not. That trade is deliberate.
- The two ambiguous hours have answers that are defensible rather than correct, because there is no
  correct one. A round scheduled inside a skipped hour moves forward by an hour, which is what the
  user's own calendar did.
- The date and datetime form controls are different components on purpose. `DateField` produces the
  API's date format directly; `DateTimeField` is the only control whose value has to be converted,
  and it names the zone in its own description so the conversion is visible where it happens.
- Adding a date library later is not blocked, but it would have to preserve the two resolutions
  above, which are asserted rather than assumed.

## Alternatives considered

- **The browser's zone.** Rejected: the backend computes reminders from the account's, so the screen
  and the notification would disagree, and the disagreement is invisible until one fires.
- **`@date-fns/tz`,** which is already on the approved-library list. It does exactly this and is
  well tested at the edges. Rejected on weight rather than on correctness: two functions do not earn
  a runtime dependency in the bundle every form ships, and the edge behaviour is pinned here by
  tests either way. Revisit if a second consumer needs real date arithmetic rather than a
  conversion.
- **`Temporal`.** The right answer eventually, and out of scope now: it is not available across the
  runtimes this client targets without a polyfill, which is the dependency the point above declines.
- **Storing the wall clock and the zone separately**, letting the server resolve it. Rejected: it is
  not the contract, and it would move a client concern into the API for one field.
- **Refusing an ambiguous wall clock** and asking the user which they meant. Rejected as a dialog
  nobody would understand, twice a year, about an hour they are unlikely to be scheduling in.
