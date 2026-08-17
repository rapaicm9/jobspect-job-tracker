import { describe, expect, it } from "vitest";

import type { ApplicationDetail } from "@/features/applications/application-detail";
import {
  applicationFormSchema,
  toFormValues,
} from "@/features/applications/application-form-schema";
import type { CustomFieldDefinition } from "@/features/applications/custom-field-answers";
import {
  toUpdateRequest,
  type UpdateApplicationBody,
  type UpdateContext,
} from "@/features/applications/to-update-request";
import type { PlanTier } from "@/lib/enums";

/**
 * Every field carries a distinct value on purpose.
 *
 * A fixture that reuses "" or null across half its properties cannot tell a
 * field that survived from a field that was cleared into the same shape as its
 * neighbour, which is the exact failure this suite exists to catch.
 */
const STORED: ApplicationDetail = {
  id: "app-1",
  campaignId: "campaign-7",
  role: "Frontend Engineer",
  companyId: "company-3",
  companyName: "Acme",
  stage: "Offer",
  source: "Referral",
  compensation: { amount: 75000, currency: "EUR" },
  location: "Berlin",
  workMode: "Hybrid",
  postingUrl: "https://jobs.example.com/123",
  appliedDate: "2026-07-01",
  applicationDeadline: "2026-08-20",
  offerDecisionDeadline: "2026-09-05",
  cvLabel: "cv-v4",
  coverLetterLabel: "letter-acme",
  customFields: { "field-a": "Referral", "field-b": 3 },
  createdAt: "2026-07-01T08:00:00Z",
  updatedAt: "2026-08-01T09:30:00Z",
};

const DEFINITIONS: CustomFieldDefinition[] = [
  { id: "field-a", label: "Channel", type: "Text", options: [], isArchived: false },
  { id: "field-b", label: "Rounds", type: "Number", options: [], isArchived: false },
];

const PRO: UpdateContext = { tier: "Pro", definitions: DEFINITIONS };

/** The form's own round trip, so the suite asserts what the screen would send. */
function submit(
  application: ApplicationDetail,
  edits: Partial<Record<string, unknown>> = {},
  context: UpdateContext = PRO,
): UpdateApplicationBody {
  const values = applicationFormSchema.parse({ ...toFormValues(application), ...edits });
  return toUpdateRequest(application, values, context);
}

/**
 * What the stored application is worth on the wire, written out by hand.
 *
 * By hand, and that is the point: an expectation built by calling the mapper
 * would agree with it however wrong both were. Two earlier drafts of this suite
 * compared one call against another and could not see a field the mapper always
 * dropped.
 */
const EXPECTED: UpdateApplicationBody = {
  role: "Frontend Engineer",
  campaignId: "campaign-7",
  companyId: "company-3",
  companyName: null,
  compensation: { amount: 75000, currency: "EUR" },
  location: "Berlin",
  workMode: "Hybrid",
  postingUrl: "https://jobs.example.com/123",
  source: "Referral",
  appliedDate: "2026-07-01",
  applicationDeadline: "2026-08-20",
  offerDecisionDeadline: "2026-09-05",
  cvLabel: "cv-v4",
  coverLetterLabel: "letter-acme",
  customFields: { "field-a": "Referral", "field-b": 3 },
};

describe("editing one field", () => {
  const edited = submit(STORED, { location: "Hamburg" });

  it("changes the field that was edited", () => {
    expect(edited.location).toBe("Hamburg");
  });

  it("re-sends every stored value when nothing was edited at all", () => {
    // Also the guard on `EXPECTED` itself: a sixteenth property on the body
    // fails here until somebody decides what it is worth.
    expect(submit(STORED)).toEqual(EXPECTED);
  });

  /**
   * The full-replace safety test.
   *
   * Keyed off the expectation rather than off another call, so a field the
   * mapper drops fails by name. For a PUT that replaces, a dropped field is not
   * an omission - it is a field cleared in the database.
   */
  it.each(Object.keys(EXPECTED).filter((key) => key !== "location"))(
    "carries %s through untouched",
    (key) => {
      expect(edited[key as keyof UpdateApplicationBody]).toEqual(
        EXPECTED[key as keyof UpdateApplicationBody],
      );
    },
  );

  it("clears a field the user actually emptied", () => {
    // The other half of the rule. A replace that could never clear anything
    // would be safe and useless.
    expect(submit(STORED, { location: "" }).location).toBeNull();
  });
});

describe("the company, which is one of two things and never both", () => {
  it("re-references the stored company while the name is untouched", () => {
    expect(submit(STORED)).toMatchObject({ companyId: "company-3", companyName: null });
  });

  it("sends a changed name on its own, for the API to resolve or create", () => {
    expect(submit(STORED, { companyName: "Globex" })).toMatchObject({
      companyId: null,
      companyName: "Globex",
    });
  });

  it("keeps the reference when a name is typed over and put back", () => {
    // The reason the choice is made by comparison rather than by clearing the id
    // on the first keystroke.
    expect(submit(STORED, { companyName: "Acme" })).toMatchObject({
      companyId: "company-3",
      companyName: null,
    });
  });

  it("sends neither when the name is cleared", () => {
    expect(submit(STORED, { companyName: "" })).toMatchObject({
      companyId: null,
      companyName: null,
    });
  });

  it("sends the typed name when the application had no company", () => {
    const noCompany = { ...STORED, companyId: null, companyName: null };

    expect(submit(noCompany, { companyName: "Initech" })).toMatchObject({
      companyId: null,
      companyName: "Initech",
    });
  });
});

describe("the custom-field bag, whose absence means two opposite things", () => {
  it("sends the whole map for an account that may write it", () => {
    expect(submit(STORED, {}, PRO).customFields).toEqual({
      "field-a": "Referral",
      "field-b": 3,
    });
  });

  it("sends null for an account that may not, which is what retains the answers", () => {
    // Free reads an absent bag as unchanged. Sending {} instead would be refused
    // outright, and sending the map would be refused too.
    const free: UpdateContext = { tier: "Free", definitions: DEFINITIONS };

    expect(submit(STORED, {}, free).customFields).toBeNull();
  });

  it("sends the map for a tier this build does not recognise", () => {
    // The case the roadmap asked to be pinned. Read as Free it would send null,
    // and null to an entitled handler means "replace with empty" - answers gone,
    // silently. A refusal is the better failure: it names itself and changes
    // nothing.
    const unknown: UpdateContext = { tier: null, definitions: DEFINITIONS };

    expect(submit(STORED, {}, unknown).customFields).toEqual({
      "field-a": "Referral",
      "field-b": 3,
    });
  });

  it("sends null for an unrecognised tier when there is nothing to lose", () => {
    const empty = { ...STORED, customFields: {} };
    const unknown: UpdateContext = { tier: null, definitions: DEFINITIONS };

    expect(submit(empty, {}, unknown).customFields).toBeNull();
  });

  it.each<[PlanTier | null]>([["Pro"], [null]])(
    "drops an archived field's answer rather than having the whole edit refused (%s)",
    (tier) => {
      // The API refuses any write naming an archived field. An application that
      // answered one before it was retired would otherwise be uneditable in
      // every other respect.
      const definitions: CustomFieldDefinition[] = [
        DEFINITIONS[0]!,
        { ...DEFINITIONS[1]!, isArchived: true },
      ];

      expect(submit(STORED, {}, { tier, definitions }).customFields).toEqual({
        "field-a": "Referral",
      });
    },
  );

  it("sends null when every answered field has been archived and the tier is unknown", () => {
    const definitions = DEFINITIONS.map((definition) => ({ ...definition, isArchived: true }));

    expect(submit(STORED, {}, { tier: null, definitions }).customFields).toBeNull();
  });

  it("falls back to sending the answers when the definitions could not be read", () => {
    // An empty definition list is what a failed read looks like. Nothing is
    // known to be archived, so nothing is dropped - the alternative is dropping
    // every answer on a read that failed for its own reasons.
    expect(submit(STORED, {}, { tier: "Pro", definitions: [] }).customFields).toEqual({
      "field-a": "Referral",
      "field-b": 3,
    });
  });
});
