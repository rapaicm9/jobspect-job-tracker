/**
 * What a drag can answer.
 *
 * The board's own union rather than the pipeline's `TransitionResult`, and the
 * difference is one member's payload: that one carries the fresh activity
 * timeline, because the screen that raised it has a timeline to correct. This one
 * does not, and shipping a page of history to a board that renders none would be
 * a payload crossing the wire for nothing.
 *
 * Returned rather than thrown, for the reason every action here records: Next
 * replaces a thrown server error with a generic message and a digest, so anything
 * the caller has to tell apart has to come back as a value. An illegal move and
 * an outage are the two that matter - one is a fact about this application, the
 * other is worth trying again.
 */
export type MoveOutcome =
  | { kind: "moved" }
  /** The pipeline refused it. `detail` names both stages; show it verbatim. */
  | { kind: "illegal"; detail: string }
  /** Retryable, and never a validation error - nothing about the request is wrong. */
  | { kind: "unavailable" }
  /** Still being written after one re-issue of the same key. */
  | { kind: "in-flight" }
  /** The budget is spent. Retrying now is what keeps it spent. */
  | { kind: "rate-limited"; retryAfterSeconds: number | null }
  | { kind: "failed" };

/**
 * What to put in front of the user, or null when there is nothing to say.
 *
 * A function rather than a switch inside the component because two gestures now
 * answer with this union - dragging a card to a column and closing one out - and
 * the same five sentences written twice is the copy that drifts. It is also the
 * only way this is testable: the component's version needed a rendered board and
 * a drag to reach a single message.
 */
export function problemFor(result: MoveOutcome): string | null {
  switch (result.kind) {
    case "moved":
      return null;

    case "illegal":
      // The server's own sentence, which names both stages. It happens when this
      // tab's board is stale - another tab moved the card, and nothing
      // invalidates a Router Cache across tabs.
      return result.detail;

    case "unavailable":
      return "The pipeline could not be reached just now. Try again in a moment.";

    case "in-flight":
      return "This move is still being applied. Give it a moment.";

    case "rate-limited":
      // The one refusal where "try again" is the wrong advice, so it says how
      // long instead whenever the API named a figure.
      return result.retryAfterSeconds === null
        ? "Too many requests just now. Wait a moment before moving anything else."
        : `Too many requests just now. Try again in ${String(result.retryAfterSeconds)} seconds.`;

    case "failed":
      return "That move did not go through. Try again.";
  }
}
