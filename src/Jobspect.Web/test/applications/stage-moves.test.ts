import { describe, expect, it } from "vitest";

import { legalMoves } from "@/features/applications/stage-moves";
import { ACTIVE_STAGES, STAGES, type Stage } from "@/lib/enums";

/**
 * The backend's rules, written as a predicate rather than as a pair of lists.
 *
 * Deliberately a different shape from the implementation: a matrix asserted
 * against a transcription of the same slices and filters would agree with itself
 * however wrong both were. This is `Application.Classify` restated, so the two
 * only agree when the model is right.
 */
function isLegal(from: Stage, to: Stage): boolean {
  if (from === to) return false;

  const active = (stage: Stage) => (ACTIVE_STAGES as readonly string[]).includes(stage);

  // Either direction between two active stages: later advances, earlier steps
  // back. Only the same-stage case above is refused.
  if (active(from) && active(to)) return true;
  if (active(from)) return to !== "Accepted" || from === "Offer";
  if (active(to)) return true;

  return to !== "Accepted";
}

function offered(from: Stage): Stage[] {
  const moves = legalMoves(from);
  return [...moves.advanceTo, ...moves.closeAs];
}

describe("legalMoves", () => {
  // The whole matrix, not the handful the menu happens to show. This model is a
  // convenience the server overrules, so the way it fails is silently: the menu
  // offers a move, the API refuses it, and the user reads an error they did not
  // cause.
  it("agrees with the pipeline on every pair of stages", () => {
    for (const from of STAGES) {
      for (const to of STAGES) {
        expect(offered(from).includes(to), `${from} -> ${to}`).toBe(isLegal(from, to));
      }
    }
  });

  it("never offers the stage the application is already in", () => {
    for (const stage of STAGES) {
      expect(offered(stage)).not.toContain(stage);
    }
  });

  it("allows a skip forward and a step back of any distance", () => {
    // Both directions, and neither restricted to the adjacent stage: a move made
    // in error is corrected by naming where it should have gone, not by walking
    // the pipeline backwards one stage at a time.
    expect(legalMoves("Applied").advanceTo).toEqual(["Screening", "Interview", "Offer"]);
    expect(legalMoves("Interview").advanceTo).toEqual(["Applied", "Screening", "Offer"]);
    expect(legalMoves("Offer").advanceTo).toEqual(["Applied", "Screening", "Interview"]);
  });

  it("offers Accepted from Offer and from nowhere else", () => {
    // The one outcome that has to be earned: it is reachable only from an offer,
    // which also puts it out of reach of a reclassification.
    expect(legalMoves("Offer").closeAs).toContain("Accepted");

    for (const stage of STAGES) {
      if (stage === "Offer") continue;
      expect(offered(stage), `Accepted from ${stage}`).not.toContain("Accepted");
    }
  });

  it("lets a closed application be reopened into any active stage", () => {
    expect(legalMoves("Rejected").advanceTo).toEqual([
      "Applied",
      "Screening",
      "Interview",
      "Offer",
    ]);
  });

  it("lets one outcome be corrected into another", () => {
    // A ghosting that finally produces the rejection, without reopening first.
    expect(legalMoves("Ghosted").closeAs).toEqual(["Rejected", "Withdrawn"]);
  });

  it("offers nothing at all for a stage this build does not know", () => {
    // Guessing would put the server's refusals in front of the user.
    expect(legalMoves("Unknown")).toEqual({ advanceTo: [], closeAs: [] });
  });
});
