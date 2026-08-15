import type { Money } from "@/lib/money";
import { toStage, toWorkMode, type Stage, type UnknownStage, type WorkMode } from "@/lib/enums";

/**
 * One application, as the detail screen needs it.
 *
 * Raw values rather than formatted ones, for the reason `ApplicationRow` keeps
 * them: a date renders twice, once for a reader and once into `<time dateTime>`,
 * and a formatter here would have thrown the second away. The enums arrive
 * guarded, which is the one transformation worth doing once.
 *
 * `customFields` passes through unjoined. An answer means nothing without the
 * definition that types and labels it, and the definitions are a separate read
 * that can fail on its own - so the join lives in `custom-field-answers.ts` and
 * happens after both have landed.
 *
 * Free of `server-only` on purpose, like its list counterpart: a pure function
 * over a response shape is testable without a request.
 */
export interface ApplicationDetail {
  id: string;
  campaignId: string;
  role: string;
  /**
   * Kept beside the name because a full replace has to choose between them. An
   * edit that leaves the name alone re-references this exact company rather than
   * resolving a name that merely matches it.
   */
  companyId: string | null;
  companyName: string | null;
  stage: Stage | UnknownStage;
  source: string | null;
  compensation: Money | null;
  location: string | null;
  workMode: WorkMode | null;
  postingUrl: string | null;
  appliedDate: string;
  applicationDeadline: string | null;
  offerDecisionDeadline: string | null;
  cvLabel: string | null;
  coverLetterLabel: string | null;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string | null;
}

/** The response fields this reads. Structural, so the DTO satisfies it. */
export interface ApplicationDetailResponse {
  id: string;
  campaignId: string;
  role: string;
  companyId: null | string;
  companyName: null | string;
  stage: string;
  source: null | string;
  compensation: null | { amount: number; currency: string };
  location: null | string;
  workMode: null | string;
  postingUrl: null | string;
  appliedDate: string;
  applicationDeadline: null | string;
  offerDecisionDeadline: null | string;
  cvLabel: null | string;
  coverLetterLabel: null | string;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: null | string;
}

export function toApplicationDetail(response: ApplicationDetailResponse): ApplicationDetail {
  return {
    id: response.id,
    campaignId: response.campaignId,
    role: response.role,
    companyId: response.companyId,
    companyName: response.companyName,
    // Never throws and never blanks the screen: a stage this build has not heard
    // of is reported once and rendered plainly.
    stage: toStage(response.stage),
    source: response.source,
    compensation: response.compensation,
    location: response.location,
    workMode: toWorkMode(response.workMode),
    postingUrl: response.postingUrl,
    appliedDate: response.appliedDate,
    applicationDeadline: response.applicationDeadline,
    offerDecisionDeadline: response.offerDecisionDeadline,
    cvLabel: response.cvLabel,
    coverLetterLabel: response.coverLetterLabel,
    customFields: response.customFields,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
}
