import { daysUntil } from "@/lib/dates";
import type { ActiveStage } from "@/lib/enums";

/**
 * The board, as the screen needs it.
 *
 * Free of `server-only` on purpose, like the list's and the detail screen's
 * mappers: pure functions over a response shape are testable without a request,
 * and commit 3 turns the card into a Client Component that has to be able to
 * import this.
 */

/**
 * One card. It carries no stage, because the column it is in is the stage - the
 * board asks for one stage per read, so a stage on the card would be a copy of
 * the request rather than a fact about the row.
 */
export interface BoardCard {
  id: string;
  role: string;
  companyName: string | null;
  /** Raw, so the card can render both the label and `<time dateTime>`. */
  appliedDate: string;
  deadline: DeadlineChip | null;
}

export interface DeadlineChip {
  /** The date itself, for `<time dateTime>`. */
  date: string;
  label: string;
  overdue: boolean;
}

export type BoardColumn =
  | { kind: "loaded"; stage: ActiveStage; cards: BoardCard[]; truncated: boolean }
  /**
   * One column's read failed. It costs that column rather than the page: the
   * other three are still the answer to what the reader came for, and a board
   * that blanked to report one outage would take away the three that work.
   */
  | { kind: "failed"; stage: ActiveStage };

export type ClosedCount =
  /** `atLeast` when the read hit its ceiling, which renders as "100+". */
  { kind: "counted"; count: number; atLeast: boolean } | { kind: "failed" };

export interface Board {
  columns: BoardColumn[];
  closed: ClosedCount;
}

/** The fields a card reads. Structural, so an `ApplicationRow` satisfies it. */
export interface BoardCardSource {
  id: string;
  role: string;
  companyName: string | null;
  appliedDate: string;
  applicationDeadline: string | null;
}

/**
 * How close a deadline has to be before the card says anything about it.
 *
 * Three days because that is when the account's own reminder fires - the API
 * schedules `ApplicationDeadlineThreeDaysBefore` and then one on the morning
 * itself - so the chip appears exactly over the window the user is already being
 * told about, rather than on a threshold this client invented.
 */
const NEAR_DAYS = 3;

export function toDeadlineChip(deadline: string | null, today: string): DeadlineChip | null {
  const days = daysUntil(deadline, today);
  if (deadline === null || days === null) return null;

  if (days < 0) return { date: deadline, label: "Overdue", overdue: true };
  if (days > NEAR_DAYS) return null;

  const label =
    days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${String(days)} days`;

  return { date: deadline, label, overdue: false };
}

/**
 * `today` is passed in rather than read here, and that is the whole reason this
 * takes two arguments. It is the account's own calendar day, which only the
 * server knows - reading the browser's clock in commit 3's client card would put
 * a different answer in the markup than the one that was rendered, for every
 * reader whose zone disagrees with the account's.
 */
export function toBoardCard(source: BoardCardSource, today: string): BoardCard {
  return {
    id: source.id,
    role: source.role,
    companyName: source.companyName,
    appliedDate: source.appliedDate,
    deadline: toDeadlineChip(source.applicationDeadline, today),
  };
}

/** Nothing recorded at all, as opposed to nothing left in the active stages. */
export function isBoardEmpty(board: Board): boolean {
  const columnsEmpty = board.columns.every(
    (column) => column.kind === "loaded" && column.cards.length === 0,
  );

  return columnsEmpty && board.closed.kind === "counted" && board.closed.count === 0;
}
