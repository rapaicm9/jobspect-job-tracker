import { createLoader } from "nuqs/server";
import { describe, expect, it } from "vitest";

import { applicationsQueryKey, DEFAULT_FILTERS } from "@/features/applications/filters";
import { campaignScopeParsers, isScopedPath, withCampaignScope } from "@/features/campaigns";

const load = createLoader(campaignScopeParsers);

describe("the campaign scope parser", () => {
  it("reads a campaign out of the URL", () => {
    expect(load("?campaignId=abc-123").campaignId).toBe("abc-123");
  });

  it("answers null when the URL carries no scope", () => {
    // Which is not the same as "no campaign": the API applies the account's
    // default, and picking one here would mean this client deciding what an
    // absent scope means.
    expect(load("").campaignId).toBeNull();
  });
});

describe("isScopedPath", () => {
  it("covers the three screens a campaign is a context for", () => {
    expect(isScopedPath("/board")).toBe(true);
    expect(isScopedPath("/applications")).toBe(true);
    expect(isScopedPath("/applications/abc")).toBe(true);
    expect(isScopedPath("/analytics")).toBe(true);
  });

  it("leaves the account-wide screens alone", () => {
    // A scope control on these would imply they narrow, and they do not:
    // reminders are about instants, and ADR 0016 puts the goal across the
    // account.
    expect(isScopedPath("/reminders")).toBe(false);
    expect(isScopedPath("/settings")).toBe(false);
  });
});

describe("withCampaignScope", () => {
  it("carries the scope to another scoped screen", () => {
    // The whole point: a link states every parameter it wants to arrive with,
    // and one that does not state the campaign lands on the default.
    expect(withCampaignScope("/board", "abc-123")).toBe("/board?campaignId=abc-123");
  });

  it("carries it to a detail screen too", () => {
    expect(withCampaignScope("/applications/xyz", "abc-123")).toBe(
      "/applications/xyz?campaignId=abc-123",
    );
  });

  it("leaves the href bare when there is no scope in the URL", () => {
    // An absent parameter already means the default campaign, so stamping the
    // default's id would say what the URL says and read as noise.
    expect(withCampaignScope("/board", null)).toBe("/board");
  });

  it("leaves the account-wide screens alone", () => {
    expect(withCampaignScope("/reminders", "abc-123")).toBe("/reminders");
    expect(withCampaignScope("/settings", "abc-123")).toBe("/settings");
  });

  it("keeps what the href already carried", () => {
    expect(withCampaignScope("/applications?stage=Offer", "abc-123")).toBe(
      "/applications?stage=Offer&campaignId=abc-123",
    );
  });

  it("replaces a scope the href stated itself", () => {
    expect(withCampaignScope("/applications?campaignId=old", "abc-123")).toBe(
      "/applications?campaignId=abc-123",
    );
  });
});

describe("applicationsQueryKey", () => {
  it("separates two campaigns", () => {
    // Two campaigns are two lists rather than one list read two ways. Sharing a
    // key would hand a new campaign the previous one's rows and its cursor.
    expect(applicationsQueryKey({ ...DEFAULT_FILTERS, campaignId: "one" })).not.toEqual(
      applicationsQueryKey({ ...DEFAULT_FILTERS, campaignId: "two" }),
    );
  });

  it("separates a scoped list from an unscoped one", () => {
    expect(applicationsQueryKey({ ...DEFAULT_FILTERS, campaignId: "one" })).not.toEqual(
      applicationsQueryKey(DEFAULT_FILTERS),
    );
  });
});
