import { describe, expect, expectTypeOf, it } from "vitest";

import type { InterviewFormOutput } from "@/features/applications/interview-form-schema";
import {
  toCreateInterviewRequest,
  toUpdateInterviewRequest,
} from "@/features/applications/to-interview-request";
import type { InterviewFormat, InterviewOutcome, InterviewType } from "@/lib/enums";

function values(overrides: Partial<InterviewFormOutput> = {}): InterviewFormOutput {
  return {
    scheduledAt: "2026-08-20T09:00",
    type: "PhoneScreen",
    format: "Remote",
    outcome: "Pending",
    notes: "Ask about the team.",
    ...overrides,
  };
}

describe("the values a submitted interview form hands over", () => {
  it("has its three choices narrowed, so a null can never reach a request", () => {
    // The control starts unanswered and holds null while it is, which is why the
    // schema refuses one rather than the API doing it a round trip later. A
    // regression here fails the typecheck rather than a test.
    expectTypeOf<InterviewFormOutput["type"]>().toEqualTypeOf<InterviewType>();
    expectTypeOf<InterviewFormOutput["format"]>().toEqualTypeOf<InterviewFormat>();
    expectTypeOf<InterviewFormOutput["outcome"]>().toEqualTypeOf<InterviewOutcome>();
  });
});

describe("toCreateInterviewRequest", () => {
  it("sends no outcome, because the endpoint has no such field", () => {
    // Every new round is created pending, so an outcome here would be a value
    // the API has nowhere to put.
    const body = toCreateInterviewRequest(values({ outcome: "Passed" }), "UTC");

    expect(Object.keys(body).toSorted()).toEqual(["format", "notes", "scheduledAt", "type"]);
  });

  it("places the typed wall clock in the account's zone", () => {
    // The assertion that matters: the same form, two accounts, two instants. A
    // conversion done in the runner's zone would pass in one place and fail in
    // another.
    expect(toCreateInterviewRequest(values(), "Europe/Belgrade").scheduledAt).toBe(
      "2026-08-20T07:00:00.000Z",
    );
    expect(toCreateInterviewRequest(values(), "America/New_York").scheduledAt).toBe(
      "2026-08-20T13:00:00.000Z",
    );
  });

  it("carries the choices as the contract spells them", () => {
    const body = toCreateInterviewRequest(values({ type: "HrInterview", format: "Onsite" }), "UTC");

    expect(body).toMatchObject({ type: "HrInterview", format: "Onsite" });
  });
});

describe("toUpdateInterviewRequest", () => {
  it("sends all five fields, because the replace clears what it is not told", () => {
    const body = toUpdateInterviewRequest(values({ outcome: "Passed" }), "UTC");

    // Hand-written rather than compared against another call of the mapper, which
    // would agree with itself however wrong both were.
    expect(body).toEqual({
      scheduledAt: "2026-08-20T09:00:00.000Z",
      type: "PhoneScreen",
      format: "Remote",
      outcome: "Passed",
      notes: "Ask about the team.",
    });
  });

  it("clears the notes only when they were actually cleared", () => {
    // The schema has already turned a blank box into null; what this pins is that
    // nothing downstream turns it back into an empty string, which the API would
    // store as a note consisting of nothing.
    expect(toUpdateInterviewRequest(values({ notes: null }), "UTC").notes).toBeNull();
  });

  it("sends a null time rather than an invented one it cannot place", () => {
    // Unreachable through the form, whose schema refuses a malformed value. If it
    // ever is reached, the API answers keyed to the field - which is a better
    // outcome than storing a time nobody meant.
    expect(
      toUpdateInterviewRequest(values({ scheduledAt: "the 20th" }), "UTC").scheduledAt,
    ).toBeNull();
  });
});
