import { describe, expect, it } from "vitest";

import {
  isBoardEmpty,
  toBoardCard,
  toDeadlineChip,
  type Board,
  type BoardCardSource,
} from "@/features/board/board";

const TODAY = "2026-08-19";

function aSource(overrides: Partial<BoardCardSource> = {}): BoardCardSource {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    role: "Frontend Engineer",
    companyName: "Acme",
    appliedDate: "2026-08-01",
    applicationDeadline: null,
    ...overrides,
  };
}

describe("toDeadlineChip", () => {
  it("names the day for anything inside the reminder window", () => {
    // The window is three days because that is when the account's own reminder
    // fires, so the chip appears over exactly the days they are already being
    // told about rather than on a threshold this client invented.
    expect(toDeadlineChip("2026-08-19", TODAY)?.label).toBe("Due today");
    expect(toDeadlineChip("2026-08-20", TODAY)?.label).toBe("Due tomorrow");
    expect(toDeadlineChip("2026-08-21", TODAY)?.label).toBe("Due in 2 days");
    expect(toDeadlineChip("2026-08-22", TODAY)?.label).toBe("Due in 3 days");
  });

  it("says nothing about a deadline that is not near yet", () => {
    // A chip on every card is a chip that means nothing. Four days out is the
    // first day the account has heard nothing about.
    expect(toDeadlineChip("2026-08-23", TODAY)).toBeNull();
    expect(toDeadlineChip("2027-01-01", TODAY)).toBeNull();
  });

  it("keeps saying so once the day has passed", () => {
    // A deadline that has gone is more worth showing than one approaching, and it
    // never ages out of the window the way a future one ages into it.
    const chip = toDeadlineChip("2026-08-18", TODAY);

    expect(chip?.label).toBe("Overdue");
    expect(chip?.overdue).toBe(true);
    expect(toDeadlineChip("2020-01-01", TODAY)?.label).toBe("Overdue");
  });

  it("carries the date itself, so the chip can be a <time>", () => {
    expect(toDeadlineChip("2026-08-20", TODAY)?.date).toBe("2026-08-20");
  });

  it("answers null when there is no deadline or it cannot be read", () => {
    expect(toDeadlineChip(null, TODAY)).toBeNull();
    expect(toDeadlineChip("2026-08-20T09:00:00Z", TODAY)).toBeNull();
  });
});

describe("toBoardCard", () => {
  it("keeps the applied date raw, so the card can render it twice", () => {
    // The same reason the list's mapper does: a date cell renders a label for a
    // reader and the ISO value into `<time dateTime>`, and formatting in here
    // would throw the second one away.
    expect(toBoardCard(aSource(), TODAY).appliedDate).toBe("2026-08-01");
  });

  it("carries an application with no company", () => {
    // Nothing about a company is required, and losing the card off the board
    // would be worse than a card with one line fewer.
    const card = toBoardCard(aSource({ companyName: null }), TODAY);

    expect(card.companyName).toBeNull();
    expect(card.role).toBe("Frontend Engineer");
  });

  it("holds no stage, because the column it sits in is the stage", () => {
    // The board asks for one stage per read, so a stage on the card would repeat
    // the request rather than state a fact about the row.
    expect(toBoardCard(aSource(), TODAY)).not.toHaveProperty("stage");
  });

  it("resolves the deadline against the day it is handed, not the machine's", () => {
    const source = aSource({ applicationDeadline: "2026-08-20" });

    expect(toBoardCard(source, "2026-08-19").deadline?.label).toBe("Due tomorrow");
    // The same card, read by an account whose day has already turned over.
    expect(toBoardCard(source, "2026-08-21").deadline?.label).toBe("Overdue");
  });
});

describe("isBoardEmpty", () => {
  const loaded = (cards: number) =>
    ({
      kind: "loaded",
      stage: "Applied",
      cards: Array.from({ length: cards }, (_, index) =>
        toBoardCard(aSource({ id: `${index}` }), TODAY),
      ),
      truncated: false,
    }) as const;

  it("is empty only when nothing is recorded at all", () => {
    const board: Board = {
      columns: [loaded(0)],
      closed: { kind: "counted", count: 0, atLeast: false },
    };

    expect(isBoardEmpty(board)).toBe(true);
  });

  it("is not empty when everything has been closed", () => {
    // The columns are all empty and the account is anything but new. Offering it
    // "record your first application" would be wrong about what happened.
    const board: Board = {
      columns: [loaded(0)],
      closed: { kind: "counted", count: 12, atLeast: false },
    };

    expect(isBoardEmpty(board)).toBe(false);
  });

  it("is not empty when a column is simply holding something", () => {
    const board: Board = {
      columns: [loaded(1)],
      closed: { kind: "counted", count: 0, atLeast: false },
    };

    expect(isBoardEmpty(board)).toBe(false);
  });

  it("is not empty when a read failed", () => {
    // A column nobody could read is not a column known to be empty, and the empty
    // state would be claiming the account has nothing on the strength of an
    // outage.
    const board: Board = {
      columns: [loaded(0), { kind: "failed", stage: "Offer" }],
      closed: { kind: "counted", count: 0, atLeast: false },
    };

    expect(isBoardEmpty(board)).toBe(false);
    expect(isBoardEmpty({ columns: [loaded(0)], closed: { kind: "failed" } })).toBe(false);
  });
});
