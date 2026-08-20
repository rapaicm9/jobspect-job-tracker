import { describe, expect, it } from "vitest";

import { nextTargetInDirection, type TargetRect } from "@/features/board/keyboard";

// The board's real geometry, near enough: four columns of equal width side by
// side, and the close-out rail in a narrow track after the last of them. Every
// target is full height, which is what puts the whole board on one axis.

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

const APPLIED = rect("Applied", 0, 100, 280, 600);
const SCREENING = rect("Screening", 300, 100, 280, 600);
const INTERVIEW = rect("Interview", 600, 100, 280, 600);
const OFFER = rect("Offer", 900, 100, 280, 600);
const CLOSE_OUT = rect("close-out", 1200, 100, 96, 600);

/** A card dragged out of Applied: every other column accepts it, and the rail. */
const FROM_APPLIED = [SCREENING, INTERVIEW, OFFER, CLOSE_OUT];

/** A card dragged out of Interview: the two behind it accept it as well. */
const FROM_INTERVIEW = [APPLIED, SCREENING, OFFER, CLOSE_OUT];

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

  it("reaches the close-out rail by carrying on past the last column", () => {
    // The rail is one press further right than Offer rather than a direction of
    // its own, which is the whole point of moving it out from under the board.
    const rail = nextTargetInDirection(OFFER.centre, FROM_APPLIED, "right");

    expect(rail?.id).toBe("close-out");
  });

  it("does not skip to the rail from a column that has columns ahead of it", () => {
    // It is the last target on the row, so a nearest-centre rule with no sense of
    // distance would hand it back from anywhere. Nearest along the axis wins.
    for (const from of [{ x: 150, y: 400 }, SCREENING.centre, INTERVIEW.centre]) {
      expect(nextTargetInDirection(from, FROM_APPLIED, "right")?.id).not.toBe("close-out");
    }
  });

  it("steps back one column at a time", () => {
    // The pipeline runs both ways now, so an earlier column is a target and the
    // left arrow walks the row the way the right arrow does.
    const first = nextTargetInDirection(INTERVIEW.centre, FROM_INTERVIEW, "left");
    const second = nextTargetInDirection(first!.centre, FROM_INTERVIEW, "left");

    expect([first?.id, second?.id]).toEqual(["Screening", "Applied"]);
  });

  it("stops at either end rather than wrapping round", () => {
    expect(nextTargetInDirection(CLOSE_OUT.centre, FROM_APPLIED, "right")).toBeNull();
    expect(nextTargetInDirection(APPLIED.centre, FROM_INTERVIEW, "left")).toBeNull();
  });

  it("never comes back out of the rail into anything but a column", () => {
    const back = nextTargetInDirection(CLOSE_OUT.centre, FROM_APPLIED, "left");

    expect(back?.id).toBe("Offer");
  });

  it("offers nothing vertically, from anywhere on the board", () => {
    // The mutation check for the deleted fallback, and the reason it is written
    // from the top of a column as well as the middle: with a fallback to whatever
    // is nearest below, a downward press from a card near the top of Applied
    // finds no target spanning its `x` and drifts sideways into Screening - a
    // down arrow that moves the card across the board.
    for (const from of [
      { x: 150, y: 110 },
      { x: 150, y: 400 },
      { x: 150, y: 690 },
    ]) {
      expect(nextTargetInDirection(from, FROM_APPLIED, "down"), "down").toBeNull();
      expect(nextTargetInDirection(from, FROM_APPLIED, "up"), "up").toBeNull();
    }
  });

  it("offers only the rail when no column accepts the card", () => {
    // A card in Offer on a forward-only pipeline had nowhere to go but the rail.
    // It is still the shape to check: whatever the accept rules leave, sideways
    // finds it and vertical finds nothing.
    expect(nextTargetInDirection({ x: 1040, y: 400 }, [CLOSE_OUT], "right")?.id).toBe("close-out");
    expect(nextTargetInDirection({ x: 1040, y: 400 }, [CLOSE_OUT], "down")).toBeNull();
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
