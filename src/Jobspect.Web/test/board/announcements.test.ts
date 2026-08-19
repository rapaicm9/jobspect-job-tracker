import { describe, expect, it } from "vitest";

import {
  announceDragEnd,
  announceDragOver,
  announceDragStart,
  describeCard,
  describeColumn,
} from "@/features/board/announcements";
import { toBoardCard, type Board, type BoardCard, type BoardColumn } from "@/features/board/board";
import type { ActiveStage } from "@/lib/enums";

const TODAY = "2026-08-20";

function aCard(id: string, role: string, companyName: string | null = null): BoardCard {
  return toBoardCard(
    { id, role, companyName, appliedDate: "2026-08-01", applicationDeadline: null },
    TODAY,
  );
}

function loaded(stage: ActiveStage, cards: BoardCard[], truncated = false): BoardColumn {
  return { kind: "loaded", stage, cards, truncated };
}

const CARD = aCard("c1", "Frontend Engineer", "Acme");

const BOARD: Board = {
  columns: [
    loaded("Applied", [CARD]),
    loaded("Screening", [aCard("c2", "Two"), aCard("c3", "Three")]),
    loaded("Interview", []),
    loaded("Offer", [aCard("c4", "Four")]),
  ],
  closed: { kind: "counted", count: 0, atLeast: false },
};

describe("describeCard", () => {
  it("names the role and the company", () => {
    expect(describeCard(CARD)).toBe("Frontend Engineer at Acme");
  });

  it("drops the clause when no company is recorded", () => {
    // "Frontend Engineer at" is worse than saying less.
    expect(describeCard(aCard("c9", "Frontend Engineer"))).toBe("Frontend Engineer");
  });
});

describe("describeColumn", () => {
  it("says where the column is as well as what it is", () => {
    expect(describeColumn(loaded("Interview", []), 2, 4)).toContain("column 3 of 4");
  });

  it("counts what a whole column is showing", () => {
    expect(describeColumn(loaded("Screening", [aCard("a", "A"), aCard("b", "B")]), 1, 4)).toBe(
      "Screening, column 2 of 4, 2 applications",
    );
  });

  it("does not say applications when there is one of them", () => {
    expect(describeColumn(loaded("Offer", [aCard("a", "A")]), 3, 4)).toContain("1 application");
  });

  it("says showing, never a total, for a truncated column", () => {
    // The API returns no totals, so "100 applications" would be an announcement
    // stating a number this client has never been told. The header is worded the
    // same way for the same reason.
    const column = loaded(
      "Applied",
      Array.from({ length: 100 }, (_, index) => aCard(`c${String(index)}`, "Engineer")),
      true,
    );

    expect(describeColumn(column, 0, 4)).toBe("Applied, column 1 of 4, showing 100");
    expect(describeColumn(column, 0, 4)).not.toContain("applications");
  });

  it("calls an empty column empty rather than counting zero", () => {
    expect(describeColumn(loaded("Interview", []), 2, 4)).toContain("empty");
    expect(describeColumn(loaded("Interview", []), 2, 4)).not.toContain("0");
  });

  it("says a failed column could not be read, which is not the same as empty", () => {
    const failed = describeColumn({ kind: "failed", stage: "Offer" }, 3, 4);

    expect(failed).toContain("could not be loaded");
    expect(failed).not.toContain("empty");
  });
});

describe("the lifecycle announcements", () => {
  it("names the application on the lift rather than its id", () => {
    // The whole reason these exist. dnd-kit's own says "Picked up draggable item
    // 0f8c-…", because an id is all it has.
    const said = announceDragStart(BOARD, "c1", "Applied");

    expect(said).toContain("Frontend Engineer at Acme");
    expect(said).toContain("Applied");
    expect(said).not.toContain("c1");
  });

  it("names the column and where it sits while passing over it", () => {
    expect(announceDragOver(BOARD, "c1", "Interview")).toBe(
      "Frontend Engineer at Acme over Interview, column 3 of 4, empty.",
    );
  });

  it("names the close-out area as an area, not as a stage", () => {
    // It is not a column and calling it one would send someone looking for it
    // among the four.
    expect(announceDragOver(BOARD, "c1", "close-out")).toContain("close-out area");
  });

  it("says when the card is over nothing at all", () => {
    expect(announceDragOver(BOARD, "c1", null)).toContain("not over a target");
  });

  it("reports a drop by naming what it landed on", () => {
    expect(announceDragEnd(BOARD, "c1", "Screening", false)).toContain("dropped on Screening");
  });

  it("asks for an outcome after a drop on the close-out area", () => {
    // The picker opens, and a listener who is told only "dropped" has no idea
    // that something is now waiting for them.
    expect(announceDragEnd(BOARD, "c1", "close-out", false)).toContain("Choose an outcome");
  });

  it("reports a cancellation and a drop on nothing as the same fact", () => {
    // They are: the application is where it was. "Dropped" would be wrong about
    // the one thing the listener needs.
    const cancelled = announceDragEnd(BOARD, "c1", "Screening", true);

    expect(cancelled).toContain("left where it was");
    expect(announceDragEnd(BOARD, "c1", null, false)).toBe(cancelled);
  });

  it("says nothing about a card the board no longer holds", () => {
    expect(announceDragStart(BOARD, "gone", "Applied")).toBeNull();
    expect(announceDragOver(BOARD, "gone", "Offer")).toBeNull();
    expect(announceDragEnd(BOARD, "gone", "Offer", false)).toBeNull();
  });
});
