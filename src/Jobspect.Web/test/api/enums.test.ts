import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVE_STAGES,
  STAGES,
  TERMINAL_STAGES,
  isActiveStage,
  isTerminalStage,
  toEntitlement,
  toInterviewType,
  toStage,
  toWorkMode,
} from "@/lib/enums";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stage sets", () => {
  it("keeps the pipeline order the board and funnel read", () => {
    expect(ACTIVE_STAGES).toEqual(["Applied", "Screening", "Interview", "Offer"]);
  });

  it("joins active then terminal, without overlap", () => {
    expect(STAGES).toEqual([...ACTIVE_STAGES, ...TERMINAL_STAGES]);
    expect(new Set(STAGES).size).toBe(STAGES.length);
  });

  it("splits active from terminal", () => {
    expect(isActiveStage("Offer")).toBe(true);
    expect(isActiveStage("Ghosted")).toBe(false);
    expect(isTerminalStage("Withdrawn")).toBe(true);
    expect(isTerminalStage("Applied")).toBe(false);
  });
});

describe("toStage", () => {
  it("passes a known stage through", () => {
    expect(toStage("Screening")).toBe("Screening");
  });

  // The board renders this as a fifth muted column. Throwing would take out a
  // page because the server added a stage; returning null would lose the row.
  it("degrades an unknown stage instead of throwing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(toStage("Onboarding")).toBe("Unknown");
    expect(toStage(null)).toBe("Unknown");
    expect(toStage(undefined)).toBe("Unknown");
  });

  it("reports each unrecognised value once, not once per row", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    toStage("Shortlisted");
    toStage("Shortlisted");
    toStage("Shortlisted");

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("the other guards", () => {
  it("return null rather than a fallback member", () => {
    expect(toWorkMode("Remote")).toBe("Remote");
    expect(toWorkMode("Lunar")).toBeNull();
    expect(toWorkMode(null)).toBeNull();
  });

  it("carry the spellings that travel verbatim", () => {
    // British spelling on the wire, and it is not ours to normalise.
    expect(toInterviewType("Behavioural")).toBe("Behavioural");
    expect(toInterviewType("Behavioral")).toBeNull();
  });

  it("cover entitlements even though the contract does not name them", () => {
    expect(toEntitlement("MultipleCampaigns")).toBe("MultipleCampaigns");
    expect(toEntitlement("Everything")).toBeNull();
  });
});
