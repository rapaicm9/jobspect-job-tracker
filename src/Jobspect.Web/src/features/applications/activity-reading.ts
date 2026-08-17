import type { Stage, UnknownStage } from "@/lib/enums";

import type { ActivityEntry } from "./to-activity-entry";

/**
 * How an entry reads, and the timeline's cache key.
 *
 * Separate from `to-activity-entry.ts` because a Client Component runs both of
 * these and neither may drag `server-only` into the bundle. That file imports the
 * enum guards as values; this one imports two types, which are erased. The same
 * split `stage-chip.tsx` already relies on.
 */

/**
 * A piece of what an entry reads as, in order.
 *
 * A flat sequence rather than a sentence with holes in it, because the stages
 * render as chips and the words around them do not: the row walks this and emits
 * a `<span>` or a `<StageChip>` per part, and no part has to know where in the
 * phrase it sits.
 */
export type ReadingPart = { text: string } | { stage: Stage | UnknownStage };

/**
 * What an entry reads as, stages included.
 *
 * The four transition kinds are four different events and one wording for all of
 * them loses that. "Moved from Offer to Rejected" is true and says nothing about
 * what happened; "Closed as Rejected" is what the user did.
 *
 * A note reads as nothing at all - its text is the entry, and a label above it
 * would only repeat the shape of the row.
 */
export function describeEntry(entry: ActivityEntry): ReadingPart[] {
  switch (entry.kind) {
    case "Created":
      return phrase("Application recorded at", entry.toStage);

    case "StageChanged":
      return stageChange(entry);

    case "Note":
      return [];

    case null:
      // A kind this build has not heard of. Neutral rather than alarming, and
      // never dropped: losing a line of history is worse than an unfamiliar one.
      return [{ text: "Activity recorded" }];
  }
}

/** A lead and one stage, or the lead alone when the entry did not carry one. */
function phrase(lead: string, stage: Stage | UnknownStage | null): ReadingPart[] {
  return stage === null ? [{ text: lead }] : [{ text: lead }, { stage }];
}

/**
 * Advance is also what anything unrecognised reads as: a move is what every
 * stage change is, so it is the honest fallback rather than a guess.
 */
const ADVANCE = { lead: "Moved from", joiner: "to", oneEnd: "Moved to" };

const WORDING: Record<string, typeof ADVANCE> = {
  Advance: ADVANCE,
  Reopen: { lead: "Reopened, from", joiner: "back to", oneEnd: "Reopened to" },
  Reclassify: { lead: "Reclassified from", joiner: "to", oneEnd: "Reclassified as" },
};

function stageChange(entry: ActivityEntry): ReadingPart[] {
  const { fromStage, toStage, transitionKind } = entry;

  // The one that never names both ends. Where an application came from says
  // nothing about a closure - what happened is the outcome it closed as.
  if (transitionKind === "Terminal") {
    return phrase("Closed as", toStage);
  }

  const wording = WORDING[transitionKind ?? "Advance"] ?? ADVANCE;

  if (fromStage === null || toStage === null) return phrase(wording.oneEnd, toStage);

  return [
    { text: wording.lead },
    { stage: fromStage },
    { text: wording.joiner },
    { stage: toStage },
  ];
}

/**
 * One walk per application, and nothing else in the key.
 *
 * Unlike the list's, this key carries no filters or sort - the endpoint offers
 * neither - which is also why nothing here can invalidate a cursor mid-walk.
 */
export function activityQueryKey(applicationId: string): readonly unknown[] {
  return ["activity", applicationId];
}

/**
 * A page of the walk, as the cache holds it.
 *
 * Declared here rather than taken from the query that produces it: that module is
 * `server-only`, and both the feed and the composer that writes into its cache
 * are Client Components.
 */
export interface TimelinePage {
  entries: ActivityEntry[];
  nextCursor: string | null;
}
