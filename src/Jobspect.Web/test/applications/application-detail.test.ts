import { describe, expect, it, vi } from "vitest";

import {
  toApplicationDetail,
  type ApplicationDetailResponse,
} from "@/features/applications/application-detail";

function aResponse(overrides: Partial<ApplicationDetailResponse> = {}): ApplicationDetailResponse {
  return {
    id: "a2a0b7ec-0f0c-4a55-9f0f-2c0b2f2f0a11",
    campaignId: "9f7d3b21-4c2e-4a90-8f3d-5b1e2a6c7d80",
    role: "Frontend Engineer",
    companyId: "0d2a6f18-7b3c-4e51-9a2d-6c1f8b4e3a52",
    companyName: "Acme",
    stage: "Interview",
    source: "LinkedIn",
    compensation: { amount: 65000, currency: "GBP" },
    location: "London",
    workMode: "Hybrid",
    postingUrl: "https://acme.test/jobs/1",
    appliedDate: "2026-08-01",
    applicationDeadline: "2026-08-20",
    offerDecisionDeadline: null,
    cvLabel: "CV v3",
    coverLetterLabel: null,
    customFields: {},
    createdAt: "2026-08-01T09:30:00Z",
    updatedAt: null,
    ...overrides,
  };
}

describe("toApplicationDetail", () => {
  it("carries every fact the screen renders", () => {
    expect(toApplicationDetail(aResponse())).toEqual({
      id: "a2a0b7ec-0f0c-4a55-9f0f-2c0b2f2f0a11",
      campaignId: "9f7d3b21-4c2e-4a90-8f3d-5b1e2a6c7d80",
      role: "Frontend Engineer",
      companyId: "0d2a6f18-7b3c-4e51-9a2d-6c1f8b4e3a52",
      companyName: "Acme",
      stage: "Interview",
      source: "LinkedIn",
      compensation: { amount: 65000, currency: "GBP" },
      location: "London",
      workMode: "Hybrid",
      postingUrl: "https://acme.test/jobs/1",
      appliedDate: "2026-08-01",
      applicationDeadline: "2026-08-20",
      offerDecisionDeadline: null,
      cvLabel: "CV v3",
      coverLetterLabel: null,
      customFields: {},
      createdAt: "2026-08-01T09:30:00Z",
      updatedAt: null,
    });
  });

  it("keeps the raw dates and instants rather than formatting them", () => {
    // Both are rendered twice - once for a reader, once into `<time dateTime>` -
    // and the instants additionally need a zone the mapper does not have.
    const detail = toApplicationDetail(aResponse({ updatedAt: "2026-08-09T11:00:00Z" }));

    expect(detail.appliedDate).toBe("2026-08-01");
    expect(detail.updatedAt).toBe("2026-08-09T11:00:00Z");
  });

  it("passes nulls through untouched", () => {
    const detail = toApplicationDetail(
      aResponse({
        companyName: null,
        source: null,
        compensation: null,
        location: null,
        workMode: null,
        postingUrl: null,
        applicationDeadline: null,
        cvLabel: null,
      }),
    );

    expect(detail).toMatchObject({
      companyName: null,
      source: null,
      compensation: null,
      location: null,
      workMode: null,
      postingUrl: null,
      applicationDeadline: null,
      cvLabel: null,
    });
  });

  it("hands the custom-field bag on unjoined", () => {
    // The answers mean nothing without their definitions, which are a separate
    // read that can fail on its own - so this mapper must not try to interpret
    // them.
    const bag = { "3f2a1c00-0000-4000-8000-000000000001": "Series B" };

    expect(toApplicationDetail(aResponse({ customFields: bag })).customFields).toEqual(bag);
  });

  it("renders an application whose stage this build does not know", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(toApplicationDetail(aResponse({ stage: "Onboarding" })).stage).toBe("Unknown");

    warn.mockRestore();
  });

  it("treats an unrecognised work mode as absent", () => {
    expect(toApplicationDetail(aResponse({ workMode: "Underwater" })).workMode).toBeNull();
  });
});
