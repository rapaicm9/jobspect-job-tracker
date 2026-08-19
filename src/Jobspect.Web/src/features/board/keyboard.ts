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
 * at all. The columns are full height and cover every `y` a card can occupy, and
 * the close-out zone is full width below all of them - so the two axes separate
 * the two kinds of target without this rule having to name either.
 *
 * Vertical travel has one concession the horizontal has not: when nothing spans
 * the current `x`, it falls back to whatever is nearest horizontally. The gap
 * between two columns is a real place for a point to be - the close-out zone's
 * own centre lands in one on a four-column board - and an arrow key that does
 * nothing because of a sixteen-pixel gutter is an arrow key that looks broken.
 * Sideways has no fallback on purpose, since a column always spans a card's
 * height and a fallback there would start offering the close-out zone sideways.
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

  const spanning = ahead.filter((candidate) =>
    horizontal
      ? candidate.top <= from.y && from.y <= candidate.bottom
      : candidate.left <= from.x && from.x <= candidate.right,
  );

  const reachable = spanning.length > 0 || horizontal ? spanning : ahead;

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
