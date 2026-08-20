import { describe, expect, it } from "vitest";

import { formatInAccountZone, fromZonedInput, todayInZone, toZonedInput } from "@/lib/instants";

describe("formatInAccountZone", () => {
  it("renders an instant in the zone it is given", () => {
    expect(formatInAccountZone("2026-08-11T09:30:00Z", "UTC")).toBe("11 Aug 2026, 09:30");
  });

  it("moves the day when the account's zone does", () => {
    // The one that matters, and the reason the browser's zone is never used: an
    // interview at 22:30 UTC is the next morning in Sydney and the evening
    // before in New York. The account states one zone, the backend computes its
    // reminders from that zone, and a screen reading any other zone shows a time
    // no reminder will fire at.
    expect(formatInAccountZone("2026-08-11T22:30:00Z", "Australia/Sydney")).toBe(
      "12 Aug 2026, 08:30",
    );
    expect(formatInAccountZone("2026-08-11T02:30:00Z", "America/New_York")).toBe(
      "10 Aug 2026, 22:30",
    );
  });

  it("falls back to UTC when the account could not be read", () => {
    expect(formatInAccountZone("2026-08-11T09:30:00Z", null)).toBe("11 Aug 2026, 09:30");
  });

  it("falls back to UTC for a zone this runtime has no data for", () => {
    // `Intl` throws RangeError rather than degrading, so without the guard one
    // unknown zone identifier takes the screen down.
    expect(formatInAccountZone("2026-08-11T09:30:00Z", "Mars/Olympus")).toBe("11 Aug 2026, 09:30");
  });

  it("answers null for anything that is not an instant", () => {
    expect(formatInAccountZone("not an instant", "UTC")).toBeNull();
    expect(formatInAccountZone("", "UTC")).toBeNull();
    expect(formatInAccountZone(null, "UTC")).toBeNull();
    expect(formatInAccountZone(undefined, "UTC")).toBeNull();
  });
});

describe("toZonedInput", () => {
  it("reads an instant as the clock the account would have seen", () => {
    expect(toZonedInput("2026-08-20T07:00:00Z", "Europe/Belgrade")).toBe("2026-08-20T09:00");
    expect(toZonedInput("2026-08-20T13:00:00Z", "America/New_York")).toBe("2026-08-20T09:00");
  });

  it("carries the day across when the zone does", () => {
    expect(toZonedInput("2026-08-19T14:00:00Z", "Australia/Sydney")).toBe("2026-08-20T00:00");
  });

  it("pads every part, because the control refuses anything else", () => {
    // A datetime-local input silently ignores a value it cannot parse, which
    // presents as a form that opened empty rather than as an error.
    expect(toZonedInput("2026-01-02T03:04:00Z", "UTC")).toBe("2026-01-02T03:04");
  });

  it("falls back to UTC for a zone this runtime has no data for", () => {
    expect(toZonedInput("2026-08-20T09:00:00Z", "Mars/Olympus")).toBe("2026-08-20T09:00");
    expect(toZonedInput("2026-08-20T09:00:00Z", null)).toBe("2026-08-20T09:00");
  });

  it("answers null for anything that is not an instant", () => {
    expect(toZonedInput("not an instant", "UTC")).toBeNull();
    expect(toZonedInput(null, "UTC")).toBeNull();
    expect(toZonedInput(undefined, "UTC")).toBeNull();
  });
});

describe("fromZonedInput", () => {
  it("places a typed wall clock in the account's zone", () => {
    // Summer and winter for the same zone, which is the whole reason the offset
    // is read at the instant rather than looked up for the zone.
    expect(fromZonedInput("2026-08-20T09:00", "Europe/Belgrade")).toBe("2026-08-20T07:00:00.000Z");
    expect(fromZonedInput("2026-01-20T09:00", "Europe/Belgrade")).toBe("2026-01-20T08:00:00.000Z");

    expect(fromZonedInput("2026-08-20T09:00", "America/New_York")).toBe("2026-08-20T13:00:00.000Z");
    expect(fromZonedInput("2026-01-20T09:00", "America/New_York")).toBe("2026-01-20T14:00:00.000Z");
  });

  it("handles a zone whose offset is not a whole hour", () => {
    expect(fromZonedInput("2026-06-15T09:00", "Asia/Kolkata")).toBe("2026-06-15T03:30:00.000Z");
    expect(fromZonedInput("2026-06-15T09:00", "Pacific/Chatham")).toBe("2026-06-14T20:15:00.000Z");
  });

  it("stays exact either side of a daylight-saving change", () => {
    // Belgrade moves at 02:00 on 29 March 2026. An hour before and an hour after
    // are an hour apart on the clock and two hours apart in UTC, which a single
    // reading of the zone's offset gets wrong on one side or the other.
    expect(fromZonedInput("2026-03-29T01:30", "Europe/Belgrade")).toBe("2026-03-29T00:30:00.000Z");
    expect(fromZonedInput("2026-03-29T03:30", "Europe/Belgrade")).toBe("2026-03-29T01:30:00.000Z");
    expect(fromZonedInput("2026-03-29T12:00", "Europe/Belgrade")).toBe("2026-03-29T10:00:00.000Z");
  });

  it("moves an hour that does not exist forward, as the day around it moved", () => {
    // 02:30 is skipped in both zones, so there is no right answer - only a
    // defensible one. Both come out as 03:30 local.
    expect(fromZonedInput("2026-03-29T02:30", "Europe/Belgrade")).toBe("2026-03-29T01:30:00.000Z");
    expect(toZonedInput("2026-03-29T01:30:00.000Z", "Europe/Belgrade")).toBe("2026-03-29T03:30");

    expect(fromZonedInput("2026-03-08T02:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
    expect(toZonedInput("2026-03-08T07:30:00.000Z", "America/New_York")).toBe("2026-03-08T03:30");
  });

  it("takes the first of an hour that happens twice", () => {
    // 02:30 happens at 00:30Z on summer time and again at 01:30Z on winter time.
    // Somebody typing a time inside a repeated hour means the earlier one.
    expect(fromZonedInput("2026-10-25T02:30", "Europe/Belgrade")).toBe("2026-10-25T00:30:00.000Z");
    expect(fromZonedInput("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
  });

  it("round-trips whatever the panel is about to show", () => {
    for (const zone of ["UTC", "Europe/Belgrade", "America/New_York", "Australia/Sydney"]) {
      const local = "2026-08-20T09:00";
      expect(toZonedInput(fromZonedInput(local, zone), zone)).toBe(local);
    }
  });

  it("falls back to UTC for a zone this runtime has no data for", () => {
    expect(fromZonedInput("2026-08-20T09:00", "Mars/Olympus")).toBe("2026-08-20T09:00:00.000Z");
    expect(fromZonedInput("2026-08-20T09:00", null)).toBe("2026-08-20T09:00:00.000Z");
  });

  it("accepts the seconds some browsers add and refuses anything else", () => {
    expect(fromZonedInput("2026-08-20T09:00:30", "UTC")).toBe("2026-08-20T09:00:30.000Z");

    // An instant, not a wall clock. Reading it as one would be an hour or more
    // out, so it is refused and the API answers the absent field.
    expect(fromZonedInput("2026-08-20T09:00:00Z", "UTC")).toBeNull();
    expect(fromZonedInput("20/08/2026 09:00", "UTC")).toBeNull();
    expect(fromZonedInput("", "UTC")).toBeNull();
  });
});

describe("todayInZone", () => {
  it("reads the calendar day the account is having, not UTC's", () => {
    // The reason this exists. At 22:30 UTC it is already tomorrow in Sydney and
    // still today in Los Angeles, so a deadline "due today" is a different
    // deadline for each of them - and the account states which one it is.
    const instant = Date.parse("2026-08-11T22:30:00Z");

    expect(todayInZone("UTC", instant)).toBe("2026-08-11");
    expect(todayInZone("Australia/Sydney", instant)).toBe("2026-08-12");
    expect(todayInZone("America/Los_Angeles", instant)).toBe("2026-08-11");
  });

  it("crosses back over midnight as well", () => {
    const instant = Date.parse("2026-08-11T02:30:00Z");

    expect(todayInZone("UTC", instant)).toBe("2026-08-11");
    expect(todayInZone("America/New_York", instant)).toBe("2026-08-10");
  });

  it("pads a single-digit month and day", () => {
    // The value is compared as a string by `daysUntil`, so "2026-8-1" would parse
    // as nothing at all and every deadline would quietly lose its chip.
    expect(todayInZone("UTC", Date.parse("2026-01-02T12:00:00Z"))).toBe("2026-01-02");
  });

  it("falls back to UTC for a zone this runtime has no data for", () => {
    const instant = Date.parse("2026-08-11T22:30:00Z");

    expect(todayInZone("Mars/Olympus", instant)).toBe("2026-08-11");
    expect(todayInZone(null, instant)).toBe("2026-08-11");
  });
});
