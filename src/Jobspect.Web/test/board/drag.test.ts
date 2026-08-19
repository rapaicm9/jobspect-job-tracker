import { describe, expect, it } from "vitest";

import { legalMoves } from "@/features/applications/stage-moves";
import { toBoardCard, type BoardCard, type BoardColumn } from "@/features/board/board";
import { applyOptimisticMove, stagesAcceptedBy } from "@/features/board/drag";
import { ACTIVE_STAGES, type ActiveStage } from "@/lib/enums";

const TODAY = "2026-08-19";

function aCard(id: string, appliedDate: string): BoardCard {
  return toBoardCard(
    { id, role: `Role ${id}`, companyName: null, appliedDate, applicationDeadline: null },
    TODAY,
  );
}

function loaded(stage: ActiveStage, cards: BoardCard[], truncated = false): BoardColumn {
  return { kind: "loaded", stage, cards, truncated };
}

describe("stagesAcceptedBy", () => {
  it("agrees with the pipeline for every pair of active stages", () => {
    // The board's accept rules and the transition menu's move list are two
    // transcriptions of one state machine, and this is what stops them drifting
    // apart in silence. `legalMoves` is the one the menu ships and the one the
    // exhaustive stage-machine test already guards.
    for (const from of ACTIVE_STAGES) {
      const allowed = legalMoves(from).advanceTo;

      for (const to of ACTIVE_STAGES) {
        const boardAllows = stagesAcceptedBy(to).includes(from);
        const pipelineAllows = (allowed as readonly string[]).includes(to);

        expect(boardAllows, `${from} -> ${to}`).toBe(pipelineAllows);
      }
    }
  });

  it("lets a card skip ahead", () => {
    // The API permits a jump forward, so a drop must not be restricted to the
    // adjacent column.
    expect(stagesAcceptedBy("Offer")).toContain("Applied");
  });

  it("refuses a step back, which is not a move the pipeline has", () => {
    expect(stagesAcceptedBy("Applied")).toEqual([]);
    expect(stagesAcceptedBy("Screening")).not.toContain("Interview");
  });

  it("never accepts a card from the column it is already in", () => {
    for (const stage of ACTIVE_STAGES) {
      expect(stagesAcceptedBy(stage)).not.toContain(stage);
    }
  });
});

describe("applyOptimisticMove", () => {
  const move = { cardId: "b", from: "Applied", to: "Interview" } as const;

  it("takes the card out of the column it came from", () => {
    const columns = [loaded("Applied", [aCard("a", "2026-08-10"), aCard("b", "2026-08-05")])];

    const [applied] = applyOptimisticMove(columns, move);

    expect(applied?.kind === "loaded" && applied.cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("lands it where the column's own sort puts it, not at the end", () => {
    // Newest applied first. A card applied on the 7th belongs between the 10th
    // and the 5th, which is where the next read will put it - so the optimistic
    // position and the server's agree and nothing jumps when the answer lands.
    const columns = [
      loaded("Applied", [aCard("b", "2026-08-07")]),
      loaded("Interview", [aCard("x", "2026-08-10"), aCard("y", "2026-08-05")]),
    ];

    const [, interview] = applyOptimisticMove(columns, move);

    expect(interview?.kind === "loaded" && interview.cards.map((c) => c.id)).toEqual([
      "x",
      "b",
      "y",
    ]);
  });

  it("breaks a tie by id descending, the way the endpoint does", () => {
    // A UUIDv7 is time-ordered, so this is "most recently created first" among
    // rows sharing a date rather than an arbitrary rule.
    const columns = [
      loaded("Applied", [aCard("b", "2026-08-10")]),
      loaded("Interview", [aCard("c", "2026-08-10"), aCard("a", "2026-08-10")]),
    ];

    const [, interview] = applyOptimisticMove(columns, move);

    expect(interview?.kind === "loaded" && interview.cards.map((c) => c.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("appends a card that sorts after everything loaded", () => {
    const columns = [
      loaded("Applied", [aCard("b", "2020-01-01")]),
      loaded("Interview", [aCard("x", "2026-08-10")]),
    ];

    const [, interview] = applyOptimisticMove(columns, move);

    expect(interview?.kind === "loaded" && interview.cards.map((c) => c.id)).toEqual(["x", "b"]);
  });

  it("moves a card into a truncated column and leaves it truncated", () => {
    // A column showing a hundred of more is not a column that refuses work, and
    // the line under it still describes what it is showing.
    const columns = [
      loaded("Applied", [aCard("b", "2026-08-07")]),
      loaded("Interview", [aCard("x", "2026-08-10")], true),
    ];

    const [, interview] = applyOptimisticMove(columns, move);

    expect(interview?.kind === "loaded" && interview.truncated).toBe(true);
    expect(interview?.kind === "loaded" && interview.cards).toHaveLength(2);
  });

  it("leaves a failed column alone", () => {
    // It has nothing to move out of and could not show a move into it, so it is
    // not a target either.
    const columns: BoardColumn[] = [
      loaded("Applied", [aCard("b", "2026-08-07")]),
      { kind: "failed", stage: "Interview" },
    ];

    expect(applyOptimisticMove(columns, move)[1]).toEqual({ kind: "failed", stage: "Interview" });
  });

  it("changes nothing when the card has already left", () => {
    // A second drop of a card this board no longer holds is a drag that has
    // already been reconciled, not a move to apply again.
    const columns = [loaded("Applied", [aCard("a", "2026-08-10")]), loaded("Interview", [])];

    expect(applyOptimisticMove(columns, move)).toBe(columns);
  });

  it("does not mutate the columns it was given", () => {
    // The base value is the server's render, and React compares it by identity.
    const source = loaded("Applied", [aCard("b", "2026-08-07")]);
    const columns = [source, loaded("Interview", [])];

    applyOptimisticMove(columns, move);

    expect(source.kind === "loaded" && source.cards.map((c) => c.id)).toEqual(["b"]);
  });
});
