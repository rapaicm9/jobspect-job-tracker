import type { CreateApplicationFormOutput } from "./application-form-schema";
import type { UpdateApplicationBody } from "./to-update-request";

/**
 * The body that opens an application. The replace's, minus the two properties
 * the endpoint does not have.
 */
export type CreateApplicationBody = Omit<UpdateApplicationBody, "offerDecisionDeadline">;

/**
 * Everything the API needs to open an application, as one body.
 *
 * Simpler than its replace counterpart in all three of the places that one is
 * hard, and each simplification is worth naming because the next person will
 * reasonably expect the same care here:
 *
 * - **The company is always a name.** There is no stored application to have a
 *   company id from, so the XOR has one branch: whatever was typed, for the API
 *   to match case-insensitively or create.
 * - **The campaign is the scope, or nothing.** An absent one means the account's
 *   default, which is the API's rule rather than a guess made here - so creating
 *   from a scoped screen lands in the campaign being looked at, and creating
 *   from an unscoped one lets the server decide.
 * - **The custom-field bag is always null**, so no tier is read on this screen at
 *   all. A new application has no answers to retain or clear, which is the whole
 *   asymmetry that made the replace need a plan read.
 */
export function toCreateRequest(
  values: CreateApplicationFormOutput,
  campaignId: string | null,
): CreateApplicationBody {
  return {
    role: values.role,
    campaignId,
    companyId: null,
    companyName: values.companyName,
    compensation: values.compensation,
    location: values.location,
    workMode: values.workMode,
    postingUrl: values.postingUrl,
    source: values.source,
    appliedDate: values.appliedDate,
    applicationDeadline: values.applicationDeadline,
    cvLabel: values.cvLabel,
    coverLetterLabel: values.coverLetterLabel,
    customFields: null,
  };
}
