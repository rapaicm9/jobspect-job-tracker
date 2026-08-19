import { describe, expect, it } from "vitest";

import { problemFor, type MoveOutcome } from "@/features/board/move";

// Two gestures answer with this union now, so the sentences are held here rather
// than reached through a rendered board and a drag.

describe("problemFor", () => {
  it("says nothing at all about a move that landed", () => {
    expect(problemFor({ kind: "moved" })).toBeNull();
  });

  it("passes the pipeline's own refusal through verbatim", () => {
    // It names both stages, and it knows which move was refused better than a
    // client reconstructing the sentence would.
    const detail = "An application cannot move from Offer to Applied.";

    expect(problemFor({ kind: "illegal", detail })).toBe(detail);
  });

  it("offers to try again when the pipeline could not be reached", () => {
    expect(problemFor({ kind: "unavailable" })).toMatch(/try again/i);
  });

  it("asks for a moment when the same key is still being written", () => {
    expect(problemFor({ kind: "in-flight" })).toMatch(/still being applied/i);
  });

  it("says how long to wait when the API named a figure", () => {
    // The one refusal where "try again" is the wrong advice: trying again now is
    // what keeps the budget spent.
    expect(problemFor({ kind: "rate-limited", retryAfterSeconds: 30 })).toContain("30 seconds");
  });

  it("does not invent a number when the API named none", () => {
    const message = problemFor({ kind: "rate-limited", retryAfterSeconds: null });

    expect(message).toMatch(/wait a moment/i);
    expect(message).not.toMatch(/\d/);
  });

  it("has something to say for every outcome it can be handed", () => {
    // A total switch: adding a member without deciding what the board says about
    // it should not compile, and this is the runtime half of that.
    const outcomes: MoveOutcome[] = [
      { kind: "moved" },
      { kind: "illegal", detail: "no" },
      { kind: "unavailable" },
      { kind: "in-flight" },
      { kind: "rate-limited", retryAfterSeconds: null },
      { kind: "failed" },
    ];

    for (const outcome of outcomes) {
      if (outcome.kind === "moved") continue;

      expect(problemFor(outcome), outcome.kind).not.toBe("");
      expect(problemFor(outcome), outcome.kind).not.toBeNull();
    }
  });
});
