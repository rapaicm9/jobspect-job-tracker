import { describe, expect, it } from "vitest";

import { nextTargetInDirection, type TargetRect } from "@/features/board/keyboard";

// The board's real geometry, near enough: four columns of equal width side by
// side, and a close-out zone spanning all of them below.

function rect(id: string, left: number, top: number, width: number, height: number): TargetRect {
  return {
    id,
    left,
    right: left + width,
    top,
    bottom: top + height,
    centre: { x: left + width / 2, y: top + height / 2 },
  };
}

const SCREENING = rect("Screening", 300, 100, 280, 600);
const INTERVIEW = rect("Interview", 600, 100, 280, 600);
const OFFER = rect("Offer", 900, 100, 280, 600);
const CLOSE_OUT = rect("close-out", 0, 740, 1180, 60);

/** A card dragged out of Applied: everything later accepts it, and the zone. */
const FROM_APPLIED = [SCREENING, INTERVIEW, OFFER, CLOSE_OUT];

describe("nextTargetInDirection", () => {
  it("finds the adjacent column from a card at any height in its own", () => {
    // The case that decides the rule. A lifted card sits wherever it sat in its
    // column, so a test angled around the direction of travel would reject the
    // column beside it from the top and the bottom of a tall one - and the very
    // first arrow press would do nothing at all.
    for (const y of [110, 400, 690]) {
      const next = nextTargetInDirection({ x: 150, y }, FROM_APPLIED, "right");

      expect(next?.id, `from y=${String(y)}`).toBe("Screening");
    }
  });

  it("steps one column at a time rather than jumping to the end", () => {
    const first = nextTargetInDirection({ x: 150, y: 400 }, FROM_APPLIED, "right");
    const second = nextTargetInDirection(first!.centre, FROM_APPLIED, "right");
    const third = nextTargetInDirection(second!.centre, FROM_APPLIED, "right");

    expect([first?.id, second?.id, third?.id]).toEqual(["Screening", "Interview", "Offer"]);
  });

  it("walks back the way it came", () => {
    expect(nextTargetInDirection(OFFER.centre, FROM_APPLIED, "left")?.id).toBe("Interview");
  });

  it("stops at the end rather than wrapping round", () => {
    expect(nextTargetInDirection(OFFER.centre, FROM_APPLIED, "right")).toBeNull();
    expect(nextTargetInDirection({ x: 150, y: 400 }, FROM_APPLIED, "left")).toBeNull();
  });

  it("never offers the close-out zone sideways", () => {
    // It is full width, so its centre sits to the right of a card in Applied and
    // a nearest-centre rule with no spanning test would hand it back here.
    for (const from of [{ x: 150, y: 400 }, SCREENING.centre, INTERVIEW.centre]) {
      expect(nextTargetInDirection(from, FROM_APPLIED, "right")?.id).not.toBe("close-out");
      expect(nextTargetInDirection(from, FROM_APPLIED, "left")?.id).not.toBe("close-out");
    }
  });

  it("reaches the close-out zone downwards, from any column", () => {
    for (const from of [{ x: 150, y: 400 }, SCREENING.centre, OFFER.centre]) {
      expect(nextTargetInDirection(from, FROM_APPLIED, "down")?.id).toBe("close-out");
    }
  });

  it("comes back up into a column even from a gutter", () => {
    // The zone spans all four columns, so its own centre lands in the gap
    // between two of them. Requiring a column to span that point would leave the
    // up arrow doing nothing at all, on a board that looks like it should.
    const up = nextTargetInDirection(CLOSE_OUT.centre, FROM_APPLIED, "up");

    expect(up).not.toBeNull();
    expect(up?.id).not.toBe("close-out");
  });

  it("is deterministic about which column it comes back up into", () => {
    const first = nextTargetInDirection(CLOSE_OUT.centre, FROM_APPLIED, "up");
    const again = nextTargetInDirection(CLOSE_OUT.centre, [...FROM_APPLIED].reverse(), "up");

    expect(first?.id).toBe(again?.id);
  });

  it("still keeps a column out of the way of a downward press", () => {
    // The fallback is for the vertical axis, and this is what it must not undo:
    // from a card near the top of Applied every column's centre is below it, and
    // without the spanning test the down arrow would move sideways into one.
    expect(nextTargetInDirection({ x: 150, y: 110 }, FROM_APPLIED, "down")?.id).toBe("close-out");
  });

  it("offers nothing at all when nothing accepts the card", () => {
    // A card in Offer: no column takes it, and the zone is the only target. So
    // sideways is empty and downwards is not.
    expect(nextTargetInDirection({ x: 1040, y: 400 }, [CLOSE_OUT], "right")).toBeNull();
    expect(nextTargetInDirection({ x: 1040, y: 400 }, [CLOSE_OUT], "down")?.id).toBe("close-out");
  });

  it("does not depend on the order the targets were registered in", () => {
    const forwards = nextTargetInDirection({ x: 150, y: 400 }, FROM_APPLIED, "right");
    const backwards = nextTargetInDirection(
      { x: 150, y: 400 },
      [...FROM_APPLIED].reverse(),
      "right",
    );

    expect(forwards?.id).toBe(backwards?.id);
  });

  it("breaks a dead tie deterministically", () => {
    // Two targets the same distance away on both axes. Whichever is chosen, it
    // has to be the same one every time or an arrow key stops being predictable.
    const a = rect("a", 300, 100, 200, 200);
    const b = rect("b", 300, 100, 200, 200);

    expect(nextTargetInDirection({ x: 100, y: 200 }, [a, b], "right")?.id).toBe("a");
    expect(nextTargetInDirection({ x: 100, y: 200 }, [b, a], "right")?.id).toBe("a");
  });
});
