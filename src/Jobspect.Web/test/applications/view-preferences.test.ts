import { describe, expect, it } from "vitest";

import {
  DEFAULT_VIEW_PREFERENCES,
  isColumnVisible,
  parseViewPreferences,
  serialiseViewPreferences,
} from "@/features/applications/view-preferences";

describe("parseViewPreferences", () => {
  it("reads back what it wrote", () => {
    const written = serialiseViewPreferences({ density: "compact", hidden: ["location"] });

    expect(parseViewPreferences(written)).toEqual({ density: "compact", hidden: ["location"] });
  });

  it("defaults when there is no cookie", () => {
    expect(parseViewPreferences(null)).toEqual(DEFAULT_VIEW_PREFERENCES);
    expect(parseViewPreferences(undefined)).toEqual(DEFAULT_VIEW_PREFERENCES);
    expect(parseViewPreferences("")).toEqual(DEFAULT_VIEW_PREFERENCES);
  });

  it("falls back on a density it does not recognise", () => {
    // The user can edit this cookie, so the value is input. "tiny" has to render
    // a list at the default height rather than a row of nothing.
    expect(parseViewPreferences("density=tiny").density).toBe(DEFAULT_VIEW_PREFERENCES.density);
  });

  it("drops a column name it does not recognise and keeps the rest", () => {
    expect(parseViewPreferences("density=compact&hidden=location,salary,workMode")).toEqual({
      density: "compact",
      hidden: ["location", "workMode"],
    });
  });

  it("tells an empty hidden list apart from an absent one", () => {
    // Both columns showing is a choice somebody made; no cookie at all is not.
    // Reading the first as the second would keep undoing the toggle.
    expect(parseViewPreferences("density=compact&hidden=").hidden).toEqual([]);
    expect(parseViewPreferences("density=compact").hidden).toEqual(DEFAULT_VIEW_PREFERENCES.hidden);
  });

  it("survives junk", () => {
    expect(parseViewPreferences("%%%")).toEqual(DEFAULT_VIEW_PREFERENCES);
  });
});

describe("isColumnVisible", () => {
  it("hides work mode and location until somebody asks for them", () => {
    expect(isColumnVisible(DEFAULT_VIEW_PREFERENCES, "workMode")).toBe(false);
    expect(isColumnVisible(DEFAULT_VIEW_PREFERENCES, "location")).toBe(false);
  });

  it("shows a column once it leaves the hidden set", () => {
    expect(isColumnVisible({ density: "compact", hidden: ["workMode"] }, "location")).toBe(true);
  });
});
