import type { Money } from "@/lib/money";
import {
  toStage,
  toWorkMode,
  type Stage,
  type UnknownStage,
  type WorkMode,
} from "@/server/api/enums";

/**
 * One row of the list, as the screen needs it.
 *
 * Raw values rather than formatted ones: a date cell renders both, the label for
 * a reader and the ISO value for `<time dateTime>`, and a formatter that ran in
 * here would have thrown the second one away. The enums arrive guarded, which is
 * the one transformation worth doing once rather than per cell.
 *
 * Free of `server-only` on purpose - this is a pure function over a response
 * shape, and keeping it importable is what lets it be tested without a request.
 */
export interface ApplicationRow {
  id: string;
  role: string;
  companyName: string | null;
  stage: Stage | UnknownStage;
  appliedDate: string;
  applicationDeadline: string | null;
  source: string | null;
  compensation: Money | null;
  location: string | null;
  workMode: WorkMode | null;
}

/** The response fields this reads. Structural, so the DTO satisfies it. */
export interface ApplicationSummary {
  id: string;
  role: string;
  companyName: null | string;
  stage: string;
  appliedDate: string;
  applicationDeadline: null | string;
  source: null | string;
  compensation: null | { amount: number; currency: string };
  location: null | string;
  workMode: null | string;
}

export function toApplicationRow(summary: ApplicationSummary): ApplicationRow {
  return {
    id: summary.id,
    role: summary.role,
    companyName: summary.companyName,
    // Never throws and never drops the row: a stage this build has not heard of
    // is reported once and rendered plainly, because losing an application off a
    // list is worse than showing an unfamiliar word.
    stage: toStage(summary.stage),
    appliedDate: summary.appliedDate,
    applicationDeadline: summary.applicationDeadline,
    source: summary.source,
    compensation: summary.compensation,
    location: summary.location,
    workMode: toWorkMode(summary.workMode),
  };
}
