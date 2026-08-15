import { ACTIVE_STAGES, TERMINAL_STAGES, type Stage, type UnknownStage } from "@/lib/enums";

/**
 * Where an application may go from where it is.
 *
 * A transcription of the state machine the aggregate enforces, and a convenience
 * rather than a rule: the server judges every move and answers an illegal one
 * with a 422 naming both stages. What this buys is a menu that does not offer
 * moves the pipeline will refuse.
 *
 * That makes it the thing most likely to drift silently, which is why the unit
 * test walks every pair of stages rather than the handful the menu shows.
 *
 * The stage lists are imported as values, so this module is server-side in
 * practice - the same position `to-activity-entry.ts` is in. The page calls it
 * and hands the menu the answers.
 */
export interface LegalMoves {
  /** Active destinations: a step forward, or a reopen out of a terminal stage. */
  advanceTo: Stage[];
  /** Terminal destinations: closing an active application, or reclassifying a closed one. */
  closeAs: Stage[];
}

/**
 * The rules, stated once:
 *
 * - active to a strictly later active stage, skips allowed;
 * - active to Rejected, Withdrawn or Ghosted from anywhere;
 * - Accepted from Offer only, and so never out of a terminal stage;
 * - terminal to any active stage, which reopens it;
 * - terminal to another outcome, which reclassifies it - except Accepted.
 *
 * A move to the stage it is already in is never a transition.
 */
export function legalMoves(from: Stage | UnknownStage): LegalMoves {
  const position = (ACTIVE_STAGES as readonly string[]).indexOf(from);

  if (position >= 0) {
    return {
      advanceTo: ACTIVE_STAGES.slice(position + 1),
      // Accepted is the exception in both directions: it is the one outcome that
      // has to be earned, so only an application holding an offer can reach it.
      closeAs: TERMINAL_STAGES.filter((stage) => stage !== "Accepted" || from === "Offer"),
    };
  }

  if ((TERMINAL_STAGES as readonly string[]).includes(from)) {
    return {
      advanceTo: [...ACTIVE_STAGES],
      closeAs: TERMINAL_STAGES.filter((stage) => stage !== from && stage !== "Accepted"),
    };
  }

  // A stage this build has never heard of. Offering nothing is the only honest
  // answer: a client that cannot say where the application is cannot say where
  // it may go, and guessing would put refusals in front of the user.
  return { advanceTo: [], closeAs: [] };
}
