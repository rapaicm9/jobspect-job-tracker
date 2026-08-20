import type { BoardColumn as Column } from "../board";

import { BoardColumn } from "./board-column";
import { CloseOutZone } from "./close-out-zone";

export interface BoardColumnsProps {
  columns: Column[];
  campaignId: string | null;
}

/**
 * Four columns side by side with the close-out rail after them, and sideways
 * scrolling below `lg` rather than a stack.
 *
 * The list's rule - below 768px the table becomes cards, because a horizontal
 * scrollbar on a primary screen is worse than a different layout - does not
 * transfer here. A board is a spatial arrangement, which is what makes dragging
 * one card into another column mean something; stacking it produces a list with
 * headings, and the list already exists and is better at being one.
 *
 * The rail's track is **always in the layout**, whether or not a drag is
 * running, and that is the whole reason it is declared here rather than by the
 * zone itself. A track that appeared with the gesture would resize the four
 * columns at the moment a card is lifted - moving every drop target after
 * dnd-kit has measured it, under the pointer that is holding the card. Empty
 * whitespace is the cost of the columns standing still.
 */
export function BoardColumns({ columns, campaignId }: BoardColumnsProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-[repeat(4,minmax(0,1fr))_6rem] lg:overflow-visible lg:pb-0">
      {columns.map((column) => (
        <BoardColumn key={column.stage} column={column} campaignId={campaignId} />
      ))}

      <CloseOutZone />
    </div>
  );
}
