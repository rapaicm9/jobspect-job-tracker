import {
  ACTIVE_STAGES,
  TERMINAL_STAGES,
  type ActiveStage,
  type Stage,
  type TerminalStage,
} from "@/lib/enums";

import type { BoardCard, BoardColumn } from "./board";

/**
 * The drag's rules, as pure functions over the board.
 *
 * Free of `server-only` and of React, like the mappers beside them: the drag
 * component is where they are used and a test is where they are checked, and
 * neither needs the other.
 */

/**
 * The stages whose cards this column will accept.
 *
 * The pipeline only moves forward: an active application may skip ahead but
 * never step back, so everything earlier in the order may enter and nothing
 * later may. Applied accepts nothing at all, being the first.
 *
 * Handed to dnd-kit as a droppable's `accept`, which it checks against the
 * draggable's `type` - so an illegal drop never registers rather than being
 * caught after the fact. The client's model of the state machine is still only a
 * convenience: the server judges every move and a refusal is still handled.
 */
export function stagesAcceptedBy(stage: ActiveStage): ActiveStage[] {
  return ACTIVE_STAGES.slice(0, ACTIVE_STAGES.indexOf(stage));
}

/**
 * The close-out zone's droppable id.
 *
 * Named here so the zone and the drop handler read one value: the handler tells
 * this target from a column by comparing against it, and a literal in two places
 * is a rename away from a drop that silently resolves to nothing.
 */
export const CLOSE_OUT_TARGET = "close-out";

/**
 * The outcomes a card in this stage may be closed on.
 *
 * Accepted is the exception, and it is the whole reason this is a function of the
 * stage rather than a constant: it has to be earned, so only an application
 * holding an offer can reach it. The other three reach from anywhere.
 *
 * A second transcription of the state machine, like `stagesAcceptedBy` above, and
 * held to `legalMoves` by the same unit test. It cannot call `legalMoves`: that
 * lives behind the applications barrel, which carries `server-only` queries, and
 * this is read by a Client Component.
 */
export function closeOutcomesFor(stage: ActiveStage): TerminalStage[] {
  return TERMINAL_STAGES.filter((outcome) => outcome !== "Accepted" || stage === "Offer");
}

/** The card behind an id, since a drop hands over nothing else. */
export function findCard(columns: BoardColumn[], cardId: string): BoardCard | undefined {
  for (const column of columns) {
    if (column.kind !== "loaded") continue;

    const card = column.cards.find((entry) => entry.id === cardId);
    if (card !== undefined) return card;
  }

  return undefined;
}

export interface OptimisticMove {
  cardId: string;
  from: ActiveStage;
  /**
   * Any stage, not just an active one. A close-out names a terminal stage the
   * board holds no column for, which needs no branch below - see there.
   */
  to: Stage;
}

/**
 * Newest applied first, ties broken by id descending.
 *
 * The API orders this list `AppliedDate DESC, Id DESC`, and a UUIDv7 is
 * time-ordered, so the tiebreak is not arbitrary - it is "most recently created
 * first" among rows sharing a date. Reproducing both here is what lets an
 * optimistic card land where the next read will actually put it.
 */
function sortsBefore(card: BoardCard, existing: BoardCard): boolean {
  if (card.appliedDate !== existing.appliedDate) {
    return card.appliedDate > existing.appliedDate;
  }

  return card.id > existing.id;
}

function withCardAt(cards: BoardCard[], card: BoardCard): BoardCard[] {
  const at = cards.findIndex((existing) => sortsBefore(card, existing));

  // Appended when it sorts after everything loaded, which is also what happens
  // when it belongs past the end of a truncated column's first page.
  return at < 0 ? [...cards, card] : [...cards.slice(0, at), card, ...cards.slice(at)];
}

/**
 * The move, applied to the columns the server last rendered.
 *
 * The result is optimistic state in React's sense: it renders only while the
 * action is in flight, and the moment that action settles React goes back to
 * whatever the server most recently said. So a refusal needs no rollback code -
 * the card returns because nothing ever really moved it - and a success needs
 * the action to have revalidated this route, or the card returns from a move
 * that actually happened.
 *
 * The card lands where the column's own sort implies rather than at the end.
 * A column showing the first hundred of more receives a drop like any other; it
 * is not a column that refuses work.
 *
 * A close-out needs no branch of its own. `to` is a terminal stage, no column
 * carries one, so the card is taken out of the column it was in and no column
 * receives it - which is exactly what closing an application does to this board.
 */
export function applyOptimisticMove(
  columns: BoardColumn[],
  { cardId, from, to }: OptimisticMove,
): BoardColumn[] {
  const source = columns.find((column) => column.stage === from);
  const card =
    source?.kind === "loaded" ? source.cards.find((entry) => entry.id === cardId) : undefined;

  // Nothing to move, so nothing is changed: a card that has already left this
  // column belongs to a drag that has already been reconciled.
  if (card === undefined) return columns;

  return columns.map((column) => {
    if (column.kind !== "loaded") return column;

    if (column.stage === from) {
      return { ...column, cards: column.cards.filter((entry) => entry.id !== cardId) };
    }

    if (column.stage === to) {
      return { ...column, cards: withCardAt(column.cards, card) };
    }

    return column;
  });
}
