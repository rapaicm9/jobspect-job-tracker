import {
  toActivityKind,
  toStage,
  toTransitionKind,
  type ActivityKind,
  type Stage,
  type UnknownStage,
} from "@/server/api/enums";

/**
 * One row of an application's timeline, as the screen needs it.
 *
 * Raw `occurredAt` rather than a formatted one, for the reason the other view
 * models keep theirs: it renders twice, once for a reader and once into
 * `<time dateTime>`, and it additionally needs a zone this file does not have.
 *
 * The guards are imported as values, so this module is server-side in practice
 * even without `server-only` on it - a client component may import the type from
 * here and must not import the function. What such a component needs instead is
 * `activity-reading.ts`, which is the same split for the same reason.
 */
export interface ActivityEntry {
  id: string;
  /** Null for a kind this build has never heard of. The entry still renders. */
  kind: ActivityKind | null;
  occurredAt: string;
  fromStage: Stage | UnknownStage | null;
  toStage: Stage | UnknownStage | null;
  transitionKind: string | null;
  note: string | null;
}

/** The response fields this reads. Structural, so the DTO satisfies it. */
export interface ActivityEntrySummary {
  id: string;
  kind: string;
  occurredAt: string;
  fromStage: null | string;
  toStage: null | string;
  transitionKind: null | string;
  note: null | string;
}

export function toActivityEntry(entry: ActivityEntrySummary): ActivityEntry {
  return {
    id: entry.id,
    kind: toActivityKind(entry.kind),
    occurredAt: entry.occurredAt,
    // Guarded but not defaulted: which ends are filled follows from the kind, so
    // an absent stage is absent rather than unknown.
    fromStage: entry.fromStage === null ? null : toStage(entry.fromStage),
    toStage: entry.toStage === null ? null : toStage(entry.toStage),
    transitionKind: toTransitionKind(entry.transitionKind),
    note: entry.note,
  };
}
