import { createLoader } from "nuqs/server";
import { describe, expect, it } from "vitest";

import {
  applicationsQueryKey,
  DEFAULT_FILTERS,
  filterParsers,
} from "@/features/applications/filters";

// The parsers are exercised through a loader rather than called by hand, so what
// is asserted is what a URL actually produces.
const load = createLoader(filterParsers);

describe("the filter parsers", () => {
  it("defaults an empty query string to the API's own order", () => {
    expect(load("")).toEqual(DEFAULT_FILTERS);
  });

  it("reads a stage filter and a sort out of the URL", () => {
    expect(load("?stage=Applied,Offer&sortBy=applicationDeadline&sortDirection=asc")).toEqual({
      stage: ["Applied", "Offer"],
      sortBy: "applicationDeadline",
      sortDirection: "asc",
      // Absent from the URL, and absent means the account's default campaign.
      campaignId: null,
    });
  });

  it("falls back on a sort key it does not offer", () => {
    // The URL is user input. Sorting by role is a thing somebody could type and
    // the endpoint does not do - a list in the default order is the answer, not
    // a 422.
    expect(load("?sortBy=role").sortBy).toBe(DEFAULT_FILTERS.sortBy);
    expect(load("?sortDirection=sideways").sortDirection).toBe(DEFAULT_FILTERS.sortDirection);
  });

  it("keeps an unknown stage rather than dropping it here", () => {
    // Narrowing happens server-side, where the stage union can be imported. This
    // parser runs on both sides and cannot reach it.
    expect(load("?stage=Onboarding").stage).toEqual(["Onboarding"]);
  });
});

describe("applicationsQueryKey", () => {
  it("separates two filter sets that differ only by sort", () => {
    // Sharing a key would hand the second walk the first one's cursor, which the
    // API answers with a sort mismatch. ADR 0008 invalidates a cursor in flight
    // when the order changes, so a new walk per filter set is required.
    expect(applicationsQueryKey({ ...DEFAULT_FILTERS, sortDirection: "asc" })).not.toEqual(
      applicationsQueryKey(DEFAULT_FILTERS),
    );
  });

  it("separates two stage selections", () => {
    expect(applicationsQueryKey({ ...DEFAULT_FILTERS, stage: ["Applied"] })).not.toEqual(
      applicationsQueryKey({ ...DEFAULT_FILTERS, stage: ["Offer"] }),
    );
  });

  it("treats the same stages in a different order as one walk", () => {
    // The API answers both identically, so two cache entries would only fetch
    // the same rows twice.
    expect(applicationsQueryKey({ ...DEFAULT_FILTERS, stage: ["Offer", "Applied"] })).toEqual(
      applicationsQueryKey({ ...DEFAULT_FILTERS, stage: ["Applied", "Offer"] }),
    );
  });
});
