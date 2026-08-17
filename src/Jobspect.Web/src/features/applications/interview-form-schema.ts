import { z } from "zod";

import { INTERVIEW_FORMATS, INTERVIEW_OUTCOMES, INTERVIEW_TYPES } from "@/lib/enums";
import { optionalText, requiredChoice, requiredDateTime } from "@/lib/form-schema";
import { toZonedInput } from "@/lib/instants";

import type { Interview } from "./interview";

/**
 * What both interview forms validate, and only that.
 *
 * Shape rather than policy, as everywhere: the time, the kind and the format are
 * required because the API refuses a round without them, and the notes' length
 * stays on the server, which answers it keyed to the field.
 *
 * One schema covers scheduling and editing. `CreateInterviewRequest` carries no
 * outcome at all - a new round is always pending - so the create form renders no
 * control for it and its mapper drops the value. That is not a field hidden and
 * thrown away: the value it holds is `Pending`, which is exactly what the API is
 * about to store.
 */
export const interviewFormSchema = z.object({
  scheduledAt: requiredDateTime(
    "A date and time is required.",
    "Enter the date and time of the interview.",
  ),
  type: requiredChoice(INTERVIEW_TYPES, "Choose what kind of round this is."),
  format: requiredChoice(INTERVIEW_FORMATS, "Choose how the round is held."),
  outcome: requiredChoice(INTERVIEW_OUTCOMES, "Choose how the round ended."),
  notes: optionalText(),
});

export type InterviewFormInput = z.input<typeof interviewFormSchema>;
export type InterviewFormOutput = z.output<typeof interviewFormSchema>;

/**
 * A blank form.
 *
 * `Pending` rather than null, because it is not a choice being made on the user's
 * behalf: the endpoint has no outcome field and creates every round pending, so
 * this states what is about to happen rather than guessing at it.
 */
export function emptyFormValues(): InterviewFormInput {
  return { scheduledAt: "", type: null, format: null, outcome: "Pending", notes: "" };
}

/**
 * A stored round, as the form holds it while it is being edited.
 *
 * The instant becomes the wall clock the account would have seen, because that is
 * what the control binds to and what the user reasons in. A member this build does
 * not recognise arrives as null and presents as unanswered - the honest state,
 * since the form cannot offer a choice it has never heard of.
 *
 * Text is `""` rather than null for `toFormValues`'s usual reason: an input is a
 * string while somebody is typing in it, and the schema turns the blank back into
 * null on the way out.
 */
export function toFormValues(interview: Interview, timeZoneId: string | null): InterviewFormInput {
  return {
    scheduledAt: toZonedInput(interview.scheduledAt, timeZoneId) ?? "",
    type: interview.type,
    format: interview.format,
    outcome: interview.outcome,
    notes: interview.notes ?? "",
  };
}
