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
