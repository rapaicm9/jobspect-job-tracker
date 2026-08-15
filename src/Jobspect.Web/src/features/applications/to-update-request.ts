import type { PlanTier } from "@/lib/enums";

import type { ApplicationDetail } from "./application-detail";
import type { ApplicationFormOutput } from "./application-form-schema";
import type { CustomFieldDefinition } from "./custom-field-answers";

/**
 * The body a full replace sends. Structural rather than the generated type,
 * which stays behind the API layer.
 */
export interface UpdateApplicationBody {
  role: string | null;
  campaignId: string | null;
  companyId: string | null;
  companyName: string | null;
  compensation: { amount: number; currency: string } | null;
  location: string | null;
  workMode: string | null;
  postingUrl: string | null;
  source: string | null;
  appliedDate: string | null;
  applicationDeadline: string | null;
  offerDecisionDeadline: string | null;
  cvLabel: string | null;
  coverLetterLabel: string | null;
  customFields: Record<string, unknown> | null;
}

export interface UpdateContext {
  /** `null` when the server named a tier this build has never heard of. */
  tier: PlanTier | null;
  /** Needed only to know which fields are archived. Empty when the read failed. */
  definitions: readonly CustomFieldDefinition[];
}

/**
 * Everything the API stores about this application, as one body.
 *
 * `PUT` here replaces rather than patches, so a property left off is a property
 * cleared. The form edits eleven of the fifteen; the other four are carried from
 * what was read and re-sent unchanged, and this is the one place that is true.
 */
export function toUpdateRequest(
  application: ApplicationDetail,
  values: ApplicationFormOutput,
  context: UpdateContext,
): UpdateApplicationBody {
  return {
    role: values.role,
    // Not editable here. A campaign is the context a search is being looked at
    // in rather than a property of one application, so it travels back as read.
    campaignId: application.campaignId,
    ...company(application, values.companyName),
    compensation: values.compensation,
    location: values.location,
    workMode: values.workMode,
    postingUrl: values.postingUrl,
    source: values.source,
    appliedDate: values.appliedDate,
    applicationDeadline: values.applicationDeadline,
    offerDecisionDeadline: values.offerDecisionDeadline,
    cvLabel: values.cvLabel,
    coverLetterLabel: values.coverLetterLabel,
    customFields: customFields(application, context),
  };
}

/**
 * One of the two, never both - the request validator refuses a pair.
 *
 * Decided by whether the name moved rather than by clearing the id on the first
 * keystroke. Typing over a name and putting it back leaves the application
 * pointing at the same company it always did, and the form needs no hidden field
 * to arrange that.
 *
 * A changed name is sent on its own and the API resolves it: an existing company
 * matches case-insensitively, anything else is created.
 */
function company(
  application: ApplicationDetail,
  submitted: string | null,
): Pick<UpdateApplicationBody, "companyId" | "companyName"> {
  if (submitted === null) return { companyId: null, companyName: null };

  return submitted === application.companyName
    ? { companyId: application.companyId, companyName: null }
    : { companyId: null, companyName: submitted };
}

/**
 * What this edit does to the custom-field answers, which depends on a tier the
 * client is only guessing at.
 *
 * The asymmetry is the API's: an account that may not write the bag has an
 * absent one read as *unchanged*, and an account that may write it has an absent
 * one read as *cleared*. So the same `null` either preserves the answers or
 * destroys them, and which one it does is not this side's to know for certain.
 *
 * Hence the third branch. A tier this build does not recognise is read as Free
 * everywhere else, and that reading is safe everywhere else - but here it would
 * send `null` for an account that may in fact write, and quietly clear answers
 * nobody asked to remove. Sending the map instead risks a refusal that names
 * itself and changes nothing. An empty bag means the same under either reading,
 * so it takes the quieter option.
 *
 * Archived fields are dropped whatever the tier. The API refuses any write
 * naming one, so an application that answered a field which has since been
 * archived would have every edit of any other field refused along with it.
 */
function customFields(
  application: ApplicationDetail,
  { tier, definitions }: UpdateContext,
): Record<string, unknown> | null {
  const writable = writableAnswers(application.customFields, definitions);

  if (tier === "Free") return null;
  if (tier === "Pro") return writable;

  return Object.keys(writable).length === 0 ? null : writable;
}

function writableAnswers(
  bag: Record<string, unknown>,
  definitions: readonly CustomFieldDefinition[],
): Record<string, unknown> {
  const archived = new Set(
    definitions.filter((definition) => definition.isArchived).map((definition) => definition.id),
  );

  return Object.fromEntries(Object.entries(bag).filter(([id]) => !archived.has(id)));
}
