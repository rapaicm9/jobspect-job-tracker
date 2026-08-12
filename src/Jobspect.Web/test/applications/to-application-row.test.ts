import { describe, expect, it, vi } from "vitest";

import {
  toApplicationRow,
  type ApplicationSummary,
} from "@/features/applications/to-application-row";

function aSummary(overrides: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: "a2a0b7ec-0f0c-4a55-9f0f-2c0b2f2f0a11",
    role: "Frontend Engineer",
    companyName: "Acme",
    stage: "Interview",
    appliedDate: "2026-08-01",
    applicationDeadline: "2026-08-20",
    source: "LinkedIn",
    compensation: { amount: 65000, currency: "GBP" },
    location: "London",
    workMode: "Hybrid",
    ...overrides,
  };
}

describe("toApplicationRow", () => {
  it("carries every column the screen renders", () => {
    expect(toApplicationRow(aSummary())).toEqual({
      id: "a2a0b7ec-0f0c-4a55-9f0f-2c0b2f2f0a11",
      role: "Frontend Engineer",
      companyName: "Acme",
      stage: "Interview",
      appliedDate: "2026-08-01",
      applicationDeadline: "2026-08-20",
      source: "LinkedIn",
      compensation: { amount: 65000, currency: "GBP" },
      location: "London",
      workMode: "Hybrid",
    });
  });

  it("keeps the raw dates rather than formatting them", () => {
    // The cell renders both: the label for a reader and this for `<time>`. A
    // mapper that formatted here would have thrown the machine-readable one away.
    expect(toApplicationRow(aSummary()).appliedDate).toBe("2026-08-01");
  });

  it("passes nulls through untouched", () => {
    const row = toApplicationRow(
      aSummary({
        companyName: null,
        applicationDeadline: null,
        source: null,
        compensation: null,
        location: null,
        workMode: null,
      }),
    );

    expect(row).toMatchObject({
      companyName: null,
      applicationDeadline: null,
      source: null,
      compensation: null,
      location: null,
      workMode: null,
    });
  });

  it("keeps a row whose stage this build does not know", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Losing an application off the list is worse than showing an unfamiliar
    // word, so an unrecognised stage becomes Unknown rather than a thrown error.
    expect(toApplicationRow(aSummary({ stage: "Onboarding" })).stage).toBe("Unknown");

    warn.mockRestore();
  });

  it("treats an unrecognised work mode as absent", () => {
    expect(toApplicationRow(aSummary({ workMode: "Underwater" })).workMode).toBeNull();
  });
});
