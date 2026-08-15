import { toCustomFieldType, type CustomFieldType } from "@/lib/enums";

/**
 * One of the account's field definitions, as the screens need it.
 *
 * `type` is nullable because it is guarded: a definition typed as something this
 * build has never heard of still has a label and still has an answer, and the
 * honest thing to do with the answer is say it cannot be displayed rather than
 * guess at its shape.
 */
export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: CustomFieldType | null;
  options: string[];
  isArchived: boolean;
}

/** The response fields this reads. Structural, so the DTO satisfies it. */
export interface CustomFieldDefinitionResponse {
  id: string;
  label: string;
  type: string;
  options: string[];
  isArchived: boolean;
}

export function toCustomFieldDefinition(
  definition: CustomFieldDefinitionResponse,
): CustomFieldDefinition {
  return {
    id: definition.id,
    label: definition.label,
    type: toCustomFieldType(definition.type),
    options: definition.options,
    isArchived: definition.isArchived,
  };
}

/**
 * One answer, narrowed to something renderable.
 *
 * The bag arrives as `Record<string, unknown>` - the contract describes the
 * values as an empty schema on purpose, because an answer is whatever its
 * definition calls for and nothing short of that definition says which. So the
 * definition's type is what narrows it, and `unreadable` is what happens when
 * the value disagrees with it.
 */
export type CustomFieldAnswer = { definitionId: string; label: string; archived: boolean } & (
  | { kind: "text"; value: string }
  | { kind: "url"; value: string }
  | { kind: "number"; value: number }
  | { kind: "checkbox"; value: boolean }
  | { kind: "date"; value: string }
  | { kind: "select"; value: string }
  | { kind: "multi-select"; values: string[] }
  | { kind: "unreadable" }
);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((member) => typeof member === "string");
}

/**
 * The API validates every answer against its definition on the way in, so the
 * shapes below are the ones it stores: string for text, url, date and a single
 * selection, number, boolean, and an array of strings for several selections.
 * `unreadable` should therefore be unreachable - but `unknown` has to be narrowed
 * somewhere, and throwing inside a render loses the whole screen over one field.
 */
function narrow(definition: CustomFieldDefinition, value: unknown) {
  switch (definition.type) {
    case "Text":
      return typeof value === "string" ? { kind: "text" as const, value } : null;
    case "Url":
      return typeof value === "string" ? { kind: "url" as const, value } : null;
    case "Number":
      return typeof value === "number" ? { kind: "number" as const, value } : null;
    case "Checkbox":
      return typeof value === "boolean" ? { kind: "checkbox" as const, value } : null;
    case "Date":
      return typeof value === "string" ? { kind: "date" as const, value } : null;
    case "SingleSelect":
      return typeof value === "string" ? { kind: "select" as const, value } : null;
    case "MultiSelect":
      return isStringArray(value) ? { kind: "multi-select" as const, values: value } : null;
    case null:
      return null;
  }
}

/**
 * The answers this application has, in the order the definitions came back.
 *
 * Driven by the definitions rather than by the bag, which settles both ordering
 * and labelling in one pass: the screen reads in whatever order the account's
 * fields are listed, and an answer keyed to a definition that is not there is
 * dropped rather than shown unlabelled. Without a label there is nothing to
 * interpret, which is the whole reason the definitions are read at all.
 *
 * An archived definition keeps its answers. Archiving retires a field from new
 * applications; the answers already given still have to mean something, which is
 * the same rule the API applies when it keeps serving archived definitions to an
 * account that is no longer entitled to define them.
 */
export function toCustomFieldAnswers(
  bag: Record<string, unknown>,
  definitions: readonly CustomFieldDefinition[],
): CustomFieldAnswer[] {
  const answers: CustomFieldAnswer[] = [];

  for (const definition of definitions) {
    if (!Object.hasOwn(bag, definition.id)) continue;

    const value = bag[definition.id];
    // The API drops an explicit null on the way in rather than storing it, so a
    // key present with no value is not an answer of null - it is a bag this
    // client did not build. Treated as unanswered either way.
    if (value === null || value === undefined) continue;

    const narrowed = narrow(definition, value) ?? { kind: "unreadable" as const };

    answers.push({
      definitionId: definition.id,
      label: definition.label,
      archived: definition.isArchived,
      ...narrowed,
    });
  }

  return answers;
}
