import { describe, expect, it } from "vitest";

import {
  toCustomFieldAnswers,
  type CustomFieldDefinition,
} from "@/features/applications/custom-field-answers";

function aDefinition(overrides: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    id: "3f2a1c00-0000-4000-8000-000000000001",
    label: "Funding stage",
    type: "Text",
    options: [],
    isArchived: false,
    ...overrides,
  };
}

describe("toCustomFieldAnswers", () => {
  it("narrows each answer by the type its definition gives it", () => {
    // These are the shapes the API stores, because it validates every answer
    // against its definition on the way in.
    const definitions = [
      aDefinition({ id: "1", label: "Notes", type: "Text" }),
      aDefinition({ id: "2", label: "Careers page", type: "Url" }),
      aDefinition({ id: "3", label: "Rounds", type: "Number" }),
      aDefinition({ id: "4", label: "Referred", type: "Checkbox" }),
      aDefinition({ id: "5", label: "Heard back", type: "Date" }),
      aDefinition({ id: "6", label: "Size", type: "SingleSelect", options: ["Small", "Large"] }),
      aDefinition({ id: "7", label: "Stack", type: "MultiSelect", options: ["Go", "Rust"] }),
    ];

    const answers = toCustomFieldAnswers(
      {
        "1": "Warm intro",
        "2": "https://acme.test/careers",
        "3": 3,
        "4": true,
        "5": "2026-08-09",
        "6": "Large",
        "7": ["Go", "Rust"],
      },
      definitions,
    );

    expect(answers).toEqual([
      { definitionId: "1", label: "Notes", archived: false, kind: "text", value: "Warm intro" },
      {
        definitionId: "2",
        label: "Careers page",
        archived: false,
        kind: "url",
        value: "https://acme.test/careers",
      },
      { definitionId: "3", label: "Rounds", archived: false, kind: "number", value: 3 },
      { definitionId: "4", label: "Referred", archived: false, kind: "checkbox", value: true },
      {
        definitionId: "5",
        label: "Heard back",
        archived: false,
        kind: "date",
        value: "2026-08-09",
      },
      { definitionId: "6", label: "Size", archived: false, kind: "select", value: "Large" },
      {
        definitionId: "7",
        label: "Stack",
        archived: false,
        kind: "multi-select",
        values: ["Go", "Rust"],
      },
    ]);
  });

  it("reads in the order the definitions came back, not the bag's", () => {
    const definitions = [
      aDefinition({ id: "1", label: "First" }),
      aDefinition({ id: "2", label: "Second" }),
    ];

    const answers = toCustomFieldAnswers({ "2": "b", "1": "a" }, definitions);

    expect(answers.map((answer) => answer.label)).toEqual(["First", "Second"]);
  });

  it("keeps an archived definition's answer, flagged", () => {
    // Archiving retires a field from new applications. The answers already given
    // still have to mean something, which is why the API keeps serving the
    // definition at all.
    const answers = toCustomFieldAnswers({ "3f2a1c00-0000-4000-8000-000000000001": "Series B" }, [
      aDefinition({ isArchived: true }),
    ]);

    expect(answers).toEqual([
      {
        definitionId: "3f2a1c00-0000-4000-8000-000000000001",
        label: "Funding stage",
        archived: true,
        kind: "text",
        value: "Series B",
      },
    ]);
  });

  it("drops an answer whose definition is not there", () => {
    // Without a label there is nothing to interpret, which is the whole reason
    // the definitions are read beside the application.
    expect(toCustomFieldAnswers({ unknown: "orphan" }, [aDefinition()])).toEqual([]);
  });

  it("skips a definition this application has not answered", () => {
    expect(toCustomFieldAnswers({}, [aDefinition()])).toEqual([]);
  });

  it("treats an explicit null as unanswered rather than as an answer of null", () => {
    expect(
      toCustomFieldAnswers({ "3f2a1c00-0000-4000-8000-000000000001": null }, [aDefinition()]),
    ).toEqual([]);
  });

  it("reports a value that disagrees with its definition rather than throwing", () => {
    const answers = toCustomFieldAnswers({ "1": "twelve" }, [
      aDefinition({ id: "1", label: "Rounds", type: "Number" }),
    ]);

    expect(answers).toEqual([
      { definitionId: "1", label: "Rounds", archived: false, kind: "unreadable" },
    ]);
  });

  it("reports an answer to a field type this build has never heard of", () => {
    const answers = toCustomFieldAnswers({ "1": "whatever" }, [
      aDefinition({ id: "1", label: "Rating", type: null }),
    ]);

    expect(answers).toEqual([
      { definitionId: "1", label: "Rating", archived: false, kind: "unreadable" },
    ]);
  });

  it("refuses a multi-select answer that is not all strings", () => {
    const answers = toCustomFieldAnswers({ "1": ["Go", 7] }, [
      aDefinition({ id: "1", label: "Stack", type: "MultiSelect", options: ["Go"] }),
    ]);

    expect(answers).toEqual([
      { definitionId: "1", label: "Stack", archived: false, kind: "unreadable" },
    ]);
  });
});
