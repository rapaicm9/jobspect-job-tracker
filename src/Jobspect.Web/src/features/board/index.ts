// One barrel while nothing outside the route imports this slice. Commit 3 turns
// the cards into Client Components, at which point this needs the split
// `campaigns/` already has - a client-safe entry beside a server one - because
// the query below drags `server-only` in behind it.
export { isBoardEmpty, type Board, type BoardCard } from "./board";
export { BoardColumns } from "./components/board-columns";
export { ClosedChip } from "./components/closed-chip";
export { readBoard } from "./queries/read-board";
