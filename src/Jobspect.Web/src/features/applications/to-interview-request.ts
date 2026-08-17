import { fromZonedInput } from "@/lib/instants";

import type { InterviewFormOutput } from "./interview-form-schema";

/**
 * The bodies the two interview writes send. Structural rather than the generated
 * types, which stay behind the API layer.
 */
export interface CreateInterviewBody {
  scheduledAt: string | null;
  type: string | null;
  format: string | null;
  notes: string | null;
}

export interface UpdateInterviewBody extends CreateInterviewBody {
  outcome: string | null;
}

/**
 * Scheduling a round.
 *
 * No outcome, because the request has no such property: `CreateInterviewHandler`
 * writes every new round as pending and records its result later. The form holds
 * that same `Pending` and it is dropped here rather than sent, which is the one
 * place the difference between the two endpoints is written down.
 */
export function toCreateInterviewRequest(
  values: InterviewFormOutput,
  timeZoneId: string | null,
): CreateInterviewBody {
  return {
    // The wall clock the user typed, placed in the account's zone rather than
    // this machine's - the zone the backend will compute the round's reminders
    // from. A conversion that cannot be made sends null, and the API answers it
    // keyed to the field rather than storing a time nobody meant.
    scheduledAt: fromZonedInput(values.scheduledAt, timeZoneId),
    type: values.type,
    format: values.format,
    notes: values.notes,
  };
}

/**
 * Everything the API stores about one round, as one body.
 *
 * `PUT` here replaces rather than patches, so a property left off is a property
 * cleared - the notes on a round nobody meant to touch most of all. All five
 * travel every time, which is what makes an edit of the outcome alone safe.
 */
export function toUpdateInterviewRequest(
  values: InterviewFormOutput,
  timeZoneId: string | null,
): UpdateInterviewBody {
  return {
    ...toCreateInterviewRequest(values, timeZoneId),
    outcome: values.outcome,
  };
}
