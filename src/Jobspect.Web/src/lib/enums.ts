// The contract carries these as `enum:` arrays, but a generated union is only
// as current as the last regeneration, and an older server can still send a
// member this build has never heard of. These are the client's own copy, and
// `enum-agreement.test.ts` asserts each one still equals the contract's.
//
// Here rather than beside the API client because both sides need them as
// values: a select renders its options from one and a form schema narrows to
// one, and a Client Component cannot reach anything marked server-only. Nothing
// in this file holds a secret or a handle - it is hand-written contract
// knowledge and pure functions over it.

export const ACTIVE_STAGES = ["Applied", "Screening", "Interview", "Offer"] as const;

export const TERMINAL_STAGES = ["Accepted", "Rejected", "Withdrawn", "Ghosted"] as const;

// Order matters: the board reads the active four as columns left to right, and
// the funnel reads them as its steps.
export const STAGES = [...ACTIVE_STAGES, ...TERMINAL_STAGES] as const;

export const WORK_MODES = ["Onsite", "Hybrid", "Remote"] as const;

export const CUSTOM_FIELD_TYPES = [
  "Text",
  "Number",
  "Date",
  "Checkbox",
  "SingleSelect",
  "MultiSelect",
  "Url",
] as const;

export const CONTACT_ROLES = [
  "Recruiter",
  "HiringManager",
  "Interviewer",
  "Referral",
  "Other",
] as const;

export const ACTIVITY_KINDS = ["Created", "StageChanged", "Note"] as const;

export const INTERVIEW_TYPES = [
  "PhoneScreen",
  "Technical",
  // Casing and all: the members travel verbatim, so this is not HRInterview.
  "HrInterview",
  "Onsite",
  "Other",
] as const;

export const INTERVIEW_FORMATS = ["Remote", "Onsite", "Phone"] as const;

export const INTERVIEW_OUTCOMES = ["Pending", "Passed", "Failed", "Cancelled"] as const;

export const PLAN_TIERS = ["Free", "Pro"] as const;

export const REMINDER_KINDS = [
  "InterviewMorningBefore",
  "InterviewHourBefore",
  "ApplicationDeadlineThreeDaysBefore",
  "ApplicationDeadlineMorningOf",
  "OfferDecisionThreeDaysBefore",
  "OfferDecisionDayBefore",
  "OfferDecisionMorningOf",
  "FollowUp",
] as const;

export const TRANSITION_KINDS = ["Advance", "Terminal", "Reopen", "Reclassify"] as const;

// The one union with no counterpart in the contract: entitlements are never
// serialised as a typed member, so the agreement test cannot check this and the
// only source is the backend's Billing contracts. Changing it is a manual step.
export const ENTITLEMENTS = [
  "CustomFields",
  "FullAnalytics",
  "FollowUpRules",
  "MultipleCampaigns",
  "Export",
] as const;

export type Stage = (typeof STAGES)[number];
export type ActiveStage = (typeof ACTIVE_STAGES)[number];
export type TerminalStage = (typeof TERMINAL_STAGES)[number];
export type WorkMode = (typeof WORK_MODES)[number];
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export type ContactRole = (typeof CONTACT_ROLES)[number];
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number];
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];
export type PlanTier = (typeof PLAN_TIERS)[number];
export type ReminderKind = (typeof REMINDER_KINDS)[number];
export type TransitionKind = (typeof TRANSITION_KINDS)[number];
export type Entitlement = (typeof ENTITLEMENTS)[number];

/** A stage the server sent that this build does not recognise. */
export const UNKNOWN_STAGE = "Unknown";
export type UnknownStage = typeof UNKNOWN_STAGE;

function guard<const T extends readonly string[]>(members: T) {
  const known: ReadonlySet<string> = new Set(members);
  return (value: string | null | undefined): T[number] | null =>
    typeof value === "string" && known.has(value) ? (value as T[number]) : null;
}

export const toWorkMode = guard(WORK_MODES);
export const toCustomFieldType = guard(CUSTOM_FIELD_TYPES);
export const toContactRole = guard(CONTACT_ROLES);
export const toActivityKind = guard(ACTIVITY_KINDS);
export const toInterviewType = guard(INTERVIEW_TYPES);
export const toInterviewFormat = guard(INTERVIEW_FORMATS);
export const toInterviewOutcome = guard(INTERVIEW_OUTCOMES);
export const toPlanTier = guard(PLAN_TIERS);
export const toReminderKind = guard(REMINDER_KINDS);
export const toTransitionKind = guard(TRANSITION_KINDS);
export const toEntitlement = guard(ENTITLEMENTS);

const toKnownStage = guard(STAGES);
const reportedStages = new Set<string>();

/**
 * Unlike its siblings this never returns null and never throws. An unrecognised
 * stage is a contract that moved under us, and the board renders it as a fifth
 * muted column rather than losing the application or crashing the page. Each
 * distinct value is reported once so the gap shows up in telemetry instead of
 * once per row.
 */
export function toStage(value: string | null | undefined): Stage | UnknownStage {
  const stage = toKnownStage(value);
  if (stage !== null) return stage;

  if (typeof value === "string" && !reportedStages.has(value)) {
    reportedStages.add(value);
    console.warn(`Unrecognised stage from the API: ${value}`);
  }

  return UNKNOWN_STAGE;
}

export function isActiveStage(stage: Stage | UnknownStage): stage is ActiveStage {
  return (ACTIVE_STAGES as readonly string[]).includes(stage);
}

export function isTerminalStage(stage: Stage | UnknownStage): stage is TerminalStage {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}
