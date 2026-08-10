import { describe, expect, it } from "vitest";

import { deviceLabelFrom } from "@/features/auth/device-label";

const CHROME_ON_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SAFARI_ON_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const FIREFOX_ON_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0";

describe("a recognisable browser", () => {
  it.each([
    [CHROME_ON_WINDOWS, "Chrome on Windows"],
    [SAFARI_ON_IPHONE, "Mobile Safari on iOS"],
    [FIREFOX_ON_LINUX, "Firefox on Linux"],
  ])("is named with its platform", (userAgent, expected) => {
    expect(deviceLabelFrom(userAgent)).toBe(expected);
  });

  it("carries no version number", () => {
    // A label that moves every time the browser updates turns one device into a
    // growing list of them. The user is being asked to recognise a machine.
    expect(deviceLabelFrom(CHROME_ON_WINDOWS)).not.toMatch(/\d/);
  });
});

describe("an agent that says nothing useful", () => {
  it.each([
    ["", "Unknown device"],
    ["curl/8.5.0", "Unknown device"],
  ])("falls back rather than inventing one", (userAgent, expected) => {
    expect(deviceLabelFrom(userAgent)).toBe(expected);
  });

  it.each([null, undefined])("survives a missing header (%s)", (userAgent) => {
    expect(deviceLabelFrom(userAgent)).toBe("Unknown device");
  });
});

describe("an absurdly long agent", () => {
  it("is cut to the column the API stores it in", () => {
    // Over the limit the API answers with a field error keyed to `deviceLabel`,
    // which no form shows and no user can correct.
    const label = deviceLabelFrom(`Mozilla/5.0 (${"x".repeat(500)}) Chrome/140.0.0.0`);

    expect(label.length).toBeLessThanOrEqual(128);
  });
});
