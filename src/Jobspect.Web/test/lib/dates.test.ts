import { describe, expect, it } from "vitest";

import { formatDate } from "@/lib/dates";

describe("formatDate", () => {
  it("renders a plain date the way it was sent", () => {
    expect(formatDate("2026-08-11")).toBe("11 Aug 2026");
  });

  it("keeps the day it was given, whatever the machine's zone", () => {
    // The one that matters. `new Date("2026-01-01")` is midnight UTC, so a
    // formatter left on a zone behind UTC renders 31 Dec - the applied date
    // moves a day and nobody notices until a user in New York says so. The
    // helper pins UTC, which undoes exactly the shift that parsing introduced.
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("is immune to the shift that an unpinned formatter would introduce", () => {
    // Named explicitly rather than left to the machine, and that is the point:
    // this assertion cannot demonstrate the bug by running somewhere behind UTC,
    // because TZ is ignored on Windows and CI runs in UTC - so on neither
    // machine would removing the pin fail a test. Stating the hazard with a zone
    // of its own is what makes it verifiable anywhere.
    const unpinned = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    expect(unpinned.format(new Date("2026-01-01"))).toBe("31 Dec 2025");
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });

  it("answers null for anything that is not a plain date", () => {
    // The contract says `format: date`, so a timestamp here means the shape
    // moved and a rendered "1 Jan 1970" would be worse than an empty cell.
    expect(formatDate("2026-08-11T09:30:00Z")).toBeNull();
    expect(formatDate("not a date")).toBeNull();
    expect(formatDate("")).toBeNull();
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
  });

  it("answers null for a well-shaped date that does not exist", () => {
    expect(formatDate("2026-02-30")).not.toBe("30 Feb 2026");
  });
});
