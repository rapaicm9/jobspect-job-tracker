import type { Board } from "../board";

import { BoardColumn } from "./board-column";

export interface BoardColumnsProps {
  board: Board;
  campaignId: string | null;
}

/**
 * Four columns side by side, and sideways scrolling below `lg` rather than a
 * stack.
 *
 * The list's rule - below 768px the table becomes cards, because a horizontal
 * scrollbar on a primary screen is worse than a different layout - does not
 * transfer here. A board is a spatial arrangement, which is what makes dragging
 * one card into another column mean something; stacking it produces a list with
 * headings, and the list already exists and is better at being one.
 */
export function BoardColumns({ board, campaignId }: BoardColumnsProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
      {board.columns.map((column) => (
        <BoardColumn key={column.stage} column={column} campaignId={campaignId} />
      ))}
    </div>
  );
}
