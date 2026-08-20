import { createLoader } from "nuqs/server";
import { describe, expect, it } from "vitest";

import { filterParsers } from "@/features/applications/filters";
import { closedListHref, stageListHref } from "@/features/board/links";

/**
 * Loaded back through the list's own parsers rather than asserted as a string.
 *
 * The board hands off to the list twice - a truncated column and the closed chip
 * - and both hand-offs are only worth anything if the list arrives already
 * filtered. A link that merely *looks* right produces an unfiltered list and
 * nothing says so, which is exactly the failure this pins.
 */
const load = createLoader(filterParsers);

function query(href: string): string {
  return href.slice(href.indexOf("?"));
}

describe("stageListHref", () => {
  it("filters the list to the one stage the column was showing", () => {
    expect(load(query(stageListHref("Applied", null))).stage).toEqual(["Applied"]);
  });

  it("carries the campaign the board was being read through", () => {
    const filters = load(query(stageListHref("Applied", "abc-123")));

    // Without this the reader is moved from one job search to all of them, which
    // is a different list that happens to contain the one they wanted.
    expect(filters.campaignId).toBe("abc-123");
    expect(filters.stage).toEqual(["Applied"]);
  });
});

describe("closedListHref", () => {
  it("filters the list to all four terminal outcomes", () => {
    // The list reads `stage` as one comma-joined parameter. A repeated
    // `stage=Accepted&stage=Rejected` is a different thing it does not read, and
    // would land on an unfiltered list showing every application there is.
    expect(load(query(closedListHref(null))).stage).toEqual([
      "Accepted",
      "Rejected",
      "Withdrawn",
      "Ghosted",
    ]);
  });

  it("survives the campaign scope being stamped on afterwards", () => {
    // `withCampaignScope` rebuilds the query string through URLSearchParams,
    // which percent-encodes the separator. It has to come back out as a
    // separator.
    const filters = load(query(closedListHref("abc-123")));

    expect(filters.stage).toHaveLength(4);
    expect(filters.campaignId).toBe("abc-123");
  });

  it("names no active stage, because those are the board's own columns", () => {
    expect(load(query(closedListHref(null))).stage).not.toContain("Applied");
  });
});
