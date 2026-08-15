import { describe, expect, it, vi } from "vitest";

import { describeEntry } from "@/features/applications/activity-reading";
import {
  toActivityEntry,
  type ActivityEntrySummary,
} from "@/features/applications/to-activity-entry";

function anEntry(overrides: Partial<ActivityEntrySummary> = {}): ActivityEntrySummary {
  return {
    id: "a2a0b7ec-0f0c-4a55-9f0f-2c0b2f2f0a11",
    kind: "Note",
    occurredAt: "2026-08-11T09:30:00Z",
    fromStage: null,
    toStage: null,
    transitionKind: null,
    note: "Called the recruiter back.",
    ...overrides,
  };
}

function reading(overrides: Partial<ActivityEntrySummary>) {
  return describeEntry(toActivityEntry(anEntry(overrides)));
}

describe("toActivityEntry", () => {
  it("carries the entry the timeline renders", () => {
    expect(toActivityEntry(anEntry())).toEqual({
      id: "a2a0b7ec-0f0c-4a55-9f0f-2c0b2f2f0a11",
      kind: "Note",
      occurredAt: "2026-08-11T09:30:00Z",
      fromStage: null,
      toStage: null,
      transitionKind: null,
      note: "Called the recruiter back.",
    });
  });

  it("keeps the raw instant rather than formatting it", () => {
    // It renders twice - for a reader and into `<time dateTime>` - and the
    // reader's half needs a zone this mapper does not have.
    expect(toActivityEntry(anEntry()).occurredAt).toBe("2026-08-11T09:30:00Z");
  });

  it("leaves an absent stage absent rather than calling it unknown", () => {
    // Which ends are filled follows from the kind, so a note having no stages is
    // the shape rather than a value this build failed to recognise.
    const entry = toActivityEntry(anEntry({ kind: "Note" }));

    expect(entry.fromStage).toBeNull();
    expect(entry.toStage).toBeNull();
  });

  it("guards a stage this build does not know", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const entry = toActivityEntry(anEntry({ kind: "StageChanged", toStage: "Onboarding" }));

    expect(entry.toStage).toBe("Unknown");
    warn.mockRestore();
  });

  it("reports a kind this build does not know as null", () => {
    expect(toActivityEntry(anEntry({ kind: "Archived" })).kind).toBeNull();
  });
});

describe("describeEntry", () => {
  it("reads a creation as the stage it entered at", () => {
    expect(reading({ kind: "Created", toStage: "Applied", note: null })).toEqual([
      { text: "Application recorded at" },
      { stage: "Applied" },
    ]);
  });

  it("reads an advance as a move between both ends", () => {
    expect(
      reading({
        kind: "StageChanged",
        fromStage: "Screening",
        toStage: "Interview",
        transitionKind: "Advance",
        note: null,
      }),
    ).toEqual([
      { text: "Moved from" },
      { stage: "Screening" },
      { text: "to" },
      { stage: "Interview" },
    ]);
  });

  it("reads a closure as its outcome and never names where it came from", () => {
    // Where an application came from says nothing about a closure. "Moved from
    // Offer to Rejected" is true and reports the wrong event.
    expect(
      reading({
        kind: "StageChanged",
        fromStage: "Offer",
        toStage: "Rejected",
        transitionKind: "Terminal",
        note: null,
      }),
    ).toEqual([{ text: "Closed as" }, { stage: "Rejected" }]);
  });

  it("reads a reopen as a return", () => {
    expect(
      reading({
        kind: "StageChanged",
        fromStage: "Rejected",
        toStage: "Screening",
        transitionKind: "Reopen",
        note: null,
      }),
    ).toEqual([
      { text: "Reopened, from" },
      { stage: "Rejected" },
      { text: "back to" },
      { stage: "Screening" },
    ]);
  });

  it("reads a reclassification as one", () => {
    expect(
      reading({
        kind: "StageChanged",
        fromStage: "Ghosted",
        toStage: "Rejected",
        transitionKind: "Reclassify",
        note: null,
      }),
    ).toEqual([
      { text: "Reclassified from" },
      { stage: "Ghosted" },
      { text: "to" },
      { stage: "Rejected" },
    ]);
  });

  it("falls back to a move for a transition kind it has no word for", () => {
    expect(
      reading({
        kind: "StageChanged",
        fromStage: "Applied",
        toStage: "Screening",
        transitionKind: "Escalate",
        note: null,
      }),
    ).toEqual([
      { text: "Moved from" },
      { stage: "Applied" },
      { text: "to" },
      { stage: "Screening" },
    ]);
  });

  it("names only the destination when the entry carries one end", () => {
    expect(
      reading({
        kind: "StageChanged",
        toStage: "Interview",
        transitionKind: "Advance",
        note: null,
      }),
    ).toEqual([{ text: "Moved to" }, { stage: "Interview" }]);
  });

  it("reads a note as nothing, because its text is the entry", () => {
    expect(reading({ kind: "Note" })).toEqual([]);
  });

  it("still reads an entry whose kind it does not know", () => {
    expect(reading({ kind: "Archived", note: null })).toEqual([{ text: "Activity recorded" }]);
  });
});
