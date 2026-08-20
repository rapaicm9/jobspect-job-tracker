/**
 * What a screen reader hears while a card is being moved.
 *
 * dnd-kit ships announcements of its own and they read "Picked up draggable item
 * 0f8c…", because the only thing the library knows about a card is its id. Ours
 * are UUIDs, so the default is not merely generic - it is unusable. These are the
 * replacements, as pure functions over the board so the wording is testable
 * without a drag.
 */

import type { ActiveStage } from "@/lib/enums";

import type { Board, BoardCard, BoardColumn } from "./board";
import { CLOSE_OUT_TARGET, findCard } from "./drag";

export const CLOSE_OUT_LABEL = "the close-out area";

/**
 * The instructions read out when the grip takes focus.
 *
 * dnd-kit's own describe reordering a list, which is not what this board does:
 * there is no order within a column, and one of the targets is not a column at
 * all.
 */
export const BOARD_INSTRUCTIONS =
  "Press space to pick this application up. Use the arrow keys to choose a stage " +
  "or the close-out area, space to drop it there, escape or tab to leave it where it is.";

/** "Frontend Engineer at Acme", or just the role when no company is recorded. */
export function describeCard(card: BoardCard): string {
  return card.companyName === null ? card.role : `${card.role} at ${card.companyName}`;
}

/**
 * "Interview, column 3 of 4, showing 100".
 *
 * The count is what the column is *showing*, never what the stage holds, and a
 * truncated column says so in the same words its header does. The API returns no
 * totals, so "100 applications" would be an announcement stating a number this
 * client has never been told.
 */
export function describeColumn(column: BoardColumn, index: number, total: number): string {
  const position = `${column.stage}, column ${String(index + 1)} of ${String(total)}`;

  if (column.kind === "failed") return `${position}, could not be loaded`;
  if (column.cards.length === 0) return `${position}, empty`;

  const count = String(column.cards.length);

  return column.truncated
    ? `${position}, showing ${count}`
    : `${position}, ${count} ${column.cards.length === 1 ? "application" : "applications"}`;
}

function describeTarget(board: Board, targetId: string): string | null {
  if (targetId === CLOSE_OUT_TARGET) return CLOSE_OUT_LABEL;

  const index = board.columns.findIndex((column) => column.stage === targetId);
  const column = board.columns[index];

  return column === undefined ? null : describeColumn(column, index, board.columns.length);
}

export function announceDragStart(board: Board, cardId: string, from: ActiveStage): string | null {
  const card = findCard(board.columns, cardId);
  if (card === undefined) return null;

  return `Picked up ${describeCard(card)}, in ${from}.`;
}

export function announceDragOver(
  board: Board,
  cardId: string,
  targetId: string | null,
): string | null {
  const card = findCard(board.columns, cardId);
  if (card === undefined) return null;

  if (targetId === null) return `${describeCard(card)} is not over a target.`;

  const target = describeTarget(board, targetId);

  return target === null ? null : `${describeCard(card)} over ${target}.`;
}

export function announceDragEnd(
  board: Board,
  cardId: string,
  targetId: string | null,
  canceled: boolean,
): string | null {
  const card = findCard(board.columns, cardId);
  if (card === undefined) return null;

  // A cancellation and a drop onto nothing are the same fact to the listener: the
  // application is where it was. Saying "dropped" for either would be wrong about
  // the one thing they came to find out.
  if (canceled || targetId === null) return `${describeCard(card)} was left where it was.`;

  if (targetId === CLOSE_OUT_TARGET) {
    return `${describeCard(card)} dropped on ${CLOSE_OUT_LABEL}. Choose an outcome.`;
  }

  const target = describeTarget(board, targetId);

  return target === null ? null : `${describeCard(card)} dropped on ${target}.`;
}
