import {
  toInterviewFormat,
  toInterviewOutcome,
  toInterviewType,
  type InterviewFormat,
  type InterviewOutcome,
  type InterviewType,
} from "@/lib/enums";

/** One interview under an application, as the panel renders it. */
export interface Interview {
  id: string;
  /** An instant, so it is rendered in the account's zone and not the browser's. */
  scheduledAt: string;
  type: InterviewType | null;
  format: InterviewFormat | null;
  outcome: InterviewOutcome | null;
  notes: string | null;
}

/** The response fields this reads. Structural, so the DTO satisfies it. */
export interface InterviewSummary {
  id: string;
  scheduledAt: string;
  type: string;
  format: string;
  outcome: string;
  notes: null | string;
}

export function toInterview(interview: InterviewSummary): Interview {
  return {
    id: interview.id,
    scheduledAt: interview.scheduledAt,
    type: toInterviewType(interview.type),
    format: toInterviewFormat(interview.format),
    outcome: toInterviewOutcome(interview.outcome),
    notes: interview.notes,
  };
}
