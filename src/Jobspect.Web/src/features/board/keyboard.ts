/**
 * Where an arrow key takes a lifted card.
 *
 * Pure geometry, free of dnd-kit and of React, like the drag rules beside it. The
 * sensor is the adapter; this is the rule, and it is the half worth testing.
 */

export type Direction = "up" | "down" | "left" | "right";

export interface Point {
  x: number;
  y: number;
}

/** A drop target as the board sees it: a rectangle on screen and an id. */
export interface TargetRect {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centre: Point;
}

/**
 * The next target in a direction, or null when there is nothing that way.
 *
 * A candidate qualifies when its rectangle **spans** the current point on the
 * other axis - a horizontal move looks at targets whose box covers the current
 * `y`, a vertical one at targets whose box covers the current `x` - and when its
 * centre is on the correct side. Nearest along the axis of travel wins.
 *
 * Spanning rather than a cone around the direction of travel, and the difference
 * is the very first key press. A lifted card sits at whatever height it had in its
 * column, so from a card near the top of Applied the Offer column's centre is far
 * enough below that any angular test rejects it and the first press finds nothing
 * at all. Every target is full height and covers every `y` a card can occupy, so
 * spanning admits all of them sideways and none of them vertically.
 *
 * Which is to say the board is traversed on **one axis**. The four columns and the
 * close-out rail sit in a single row, so up and down reach nothing and are inert -
 * honestly so, since there is nothing above or below a lifted card to reach. There
 * is deliberately no fallback for a direction that finds nothing spanning: one
 * existed while the close-out zone ran full width beneath the columns, and it has
 * to go with that layout. Kept, it would make a downward press from a card near
 * the top of a column fall through to the nearest target below - which, on a
 * single row, is another column sideways.
 *
 * Ties break on the other axis and then on id, so the answer never depends on the
 * order the targets were registered in.
 */
export function nextTargetInDirection(
  from: Point,
  candidates: TargetRect[],
  direction: Direction,
): TargetRect | null {
  const horizontal = direction === "left" || direction === "right";

  const ahead = candidates.filter((candidate) => {
    switch (direction) {
      case "left":
        return candidate.centre.x < from.x;
      case "right":
        return candidate.centre.x > from.x;
      case "up":
        return candidate.centre.y < from.y;
      case "down":
        return candidate.centre.y > from.y;
    }
  });

  const reachable = ahead.filter((candidate) =>
    horizontal
      ? candidate.top <= from.y && from.y <= candidate.bottom
      : candidate.left <= from.x && from.x <= candidate.right,
  );

  const travel = (candidate: TargetRect) =>
    horizontal ? Math.abs(candidate.centre.x - from.x) : Math.abs(candidate.centre.y - from.y);

  const across = (candidate: TargetRect) =>
    horizontal ? Math.abs(candidate.centre.y - from.y) : Math.abs(candidate.centre.x - from.x);

  return reachable.reduce<TargetRect | null>((nearest, candidate) => {
    if (nearest === null) return candidate;

    const byTravel = travel(candidate) - travel(nearest);
    if (byTravel !== 0) return byTravel < 0 ? candidate : nearest;

    const byAcross = across(candidate) - across(nearest);
    if (byAcross !== 0) return byAcross < 0 ? candidate : nearest;

    return candidate.id < nearest.id ? candidate : nearest;
  }, null);
}
