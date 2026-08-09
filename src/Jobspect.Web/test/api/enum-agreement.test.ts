import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import {
  ACTIVITY_KINDS,
  CONTACT_ROLES,
  CUSTOM_FIELD_TYPES,
  ENTITLEMENTS,
  INTERVIEW_FORMATS,
  INTERVIEW_OUTCOMES,
  INTERVIEW_TYPES,
  PLAN_TIERS,
  REMINDER_KINDS,
  STAGES,
  TRANSITION_KINDS,
  WORK_MODES,
} from "@/server/api/enums";

// Read the committed document rather than a running host. The backend's own
// gate already proves the document matches the host; what is unproven is that
// this client's hand-written unions still match the document.
const contractPath = fileURLToPath(
  new URL("../../../../docs/openapi/openapi.yaml", import.meta.url),
);

interface Contract {
  components: { schemas: Record<string, { enum?: unknown[] }> };
}

const contract = parse(readFileSync(contractPath, "utf8")) as Contract;

function contractEnum(schema: string): string[] {
  const members = contract.components.schemas[schema]?.enum;

  if (members === undefined) {
    throw new Error(`The contract has no enum named ${schema}.`);
  }

  // Nullable-only enums emit a stray `null` member that the backend's schema
  // transformer strips. Guard anyway: a null is not a member either way.
  return members.filter((member): member is string => typeof member === "string");
}

const AGREEMENTS: ReadonlyArray<[schema: string, union: readonly string[]]> = [
  ["ActivityKind", ACTIVITY_KINDS],
  ["ContactRole", CONTACT_ROLES],
  ["CustomFieldType", CUSTOM_FIELD_TYPES],
  ["InterviewFormat", INTERVIEW_FORMATS],
  ["InterviewOutcome", INTERVIEW_OUTCOMES],
  ["InterviewType", INTERVIEW_TYPES],
  ["PlanTier", PLAN_TIERS],
  ["ReminderKind", REMINDER_KINDS],
  ["Stage", STAGES],
  ["TransitionKind", TRANSITION_KINDS],
  ["WorkMode", WORK_MODES],
];

describe("the client's unions still match the contract", () => {
  it.each(AGREEMENTS)("%s", (schema, union) => {
    // Order is asserted too, not just membership. The board reads the active
    // stages left to right and the funnel reads them as its steps, so a
    // reordered Stage enum is a reordered UI.
    expect(union).toEqual(contractEnum(schema));
  });

  it("covers every enum the contract defines", () => {
    const inContract = Object.entries(contract.components.schemas)
      .filter(([, schema]) => schema.enum !== undefined)
      .map(([name]) => name)
      .sort();

    // A new enum in the contract fails here rather than going unnoticed, which
    // forces the decision about whether this client needs a union for it.
    expect(inContract).toEqual(AGREEMENTS.map(([schema]) => schema).sort());
  });
});

describe("entitlements", () => {
  // ENTITLEMENTS is the one union with nothing to check it against: the API
  // never serialises an entitlement as a typed member, so its only source is
  // the backend's Billing contracts. If this ever fails, the gap has closed and
  // the union belongs in AGREEMENTS above.
  it("are still absent from the contract", () => {
    const enumMembers = Object.values(contract.components.schemas)
      .flatMap((schema) => schema.enum ?? [])
      .filter((member): member is string => typeof member === "string");

    // Substring matching over the raw document would not work: `CustomFields`
    // appears inside the operation id `listCustomFields`. Only membership of a
    // declared enum means the API actually speaks these.
    for (const entitlement of ENTITLEMENTS) {
      expect(enumMembers).not.toContain(entitlement);
    }

    expect(contract.components.schemas.Entitlement).toBeUndefined();
  });
});
