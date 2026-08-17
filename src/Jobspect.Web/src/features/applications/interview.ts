import {
  toInterviewFormat,
  toInterviewOutcome,
  toInterviewType,
  type InterviewFormat,
  type InterviewOutcome,
  type InterviewType,
} from "@/lib/enums";

// The enum members are one word to the API and two to a reader. Here rather than
// in the panel because the form offers the same members as options, and a select
// naming a round differently from the row it came off would read as two things.

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  PhoneScreen: "Phone screen",
  Technical: "Technical",
  HrInterview: "HR interview",
  Onsite: "On-site",
  Other: "Other",
};

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  Remote: "Remote",
  Onsite: "On-site",
  Phone: "Phone",
};

export const INTERVIEW_OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  Pending: "Pending",
  Passed: "Passed",
  Failed: "Failed",
  Cancelled: "Cancelled",
};

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
