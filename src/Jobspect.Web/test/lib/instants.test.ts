import { describe, expect, it } from "vitest";

import { formatInAccountZone } from "@/lib/instants";

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
