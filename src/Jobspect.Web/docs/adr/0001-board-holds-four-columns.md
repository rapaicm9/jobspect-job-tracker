# 0001 — The board holds four columns, not eight

- **Status:** Accepted
- **Date:** 2026-08-08
- **Amended:** 2026-08-19 — the closed chip counts approximately, and the unrecognised-stage column
  turned out to be unreachable. See _Revision history_.

## Context

An application moves through a fixed pipeline. Four stages are _active_ and strictly ordered —
Applied, Screening, Interview, Offer — and four are _terminal_ outcomes with no order among
themselves: Accepted, Rejected, Withdrawn, Ghosted. The API models both as members of one stage
enum, and a transition to a terminal stage uses the same endpoint as an advance.

That shared representation invites a board with one column per stage. It is the wrong reading of
the domain.

## Decision

The board shows **four columns: Applied, Screening, Interview, Offer.**

- Closing an application is a **different gesture** from advancing it: a "Close out" drop zone that
  opens an outcome picker, or the transition menu on the card. A terminal move is not a fifth
  column to the right.
- **Closed applications live in the Applications list**, behind an outcome filter. The board header
  carries a chip counting them, linking to that filtered list. **The count is an approximation and
  says so**: `GET /api/v1/applications` returns no totals (backend ADR 0008 settles paging as
  forward-only keyset with no count), so the chip is the length of one read bounded at the
  endpoint's ceiling — "87 closed" when the read ends inside it, "100+ closed" when the response
  still carries a cursor. A number the client cannot know is never asserted as one.
- **Skips are legal.** The API permits a jump forward, so a drop must not be restricted to the
  adjacent column.
- **The board reads one request per column**, each narrowed to a single stage, rather than walking
  a combined list. A combined walk fills unevenly — a page can come back almost entirely Applied,
  leaving Offer showing an empty state that is not true until the walk ends.

Three arguments fix this, in order of weight:

1. **Eight columns put unordered values on an axis that means order.** Left-to-right on a board is
   read as progression. Placing Accepted, Rejected, Withdrawn and Ghosted along it asserts a
   sequence among them that does not exist, and no amount of styling removes the implication.
2. **The terminal columns grow without bound while the active ones stay small.** Over a job search
   almost every application ends up terminal. A board whose four rightmost columns accumulate
   hundreds of cards while the working columns hold a handful is a board nobody scrolls.
3. **It matches how the API distinguishes the two.** Giving a close-out its own gesture makes the
   distinction visible rather than incidental, and an outcome picker is where the choice among four
   unordered values actually belongs.

## Consequences

- The board route renders four columns; the drag-and-drop target model has four ordered targets
  plus one close-out zone, and the zone's drop handler opens a picker rather than committing a
  transition.
- Reaching a closed application is a filter on the list, so the list's outcome filter is not
  optional polish — it is the only path to that data. The chip therefore renders even when its
  count could not be read, carrying no number rather than no link.
- **A stage this client does not ask for cannot appear on the board at all.** The five reads name
  the four active stages and the four terminal ones between them, so a ninth member added to the
  API's stage enum is invisible here until this client is rebuilt. It is visible in the list, which
  filters by stage rather than requesting one, and the stage guard reports each unrecognised value
  once so the gap reaches telemetry. This is the cost of one request per column and it is accepted:
  the alternative failure — a column silently showing a prefix of itself — is the one nobody can
  detect by looking.
- **A column whose read fails costs that column, not the board.** Five reads mean five things that
  can fail independently, and a board that blanked to report one outage would take away the three
  columns that answered. A failed column says so, and must never render as an empty one: "nothing
  in Offer" is a fact about the job search and must not be what an outage looks like.
- A column holding more than one page says so and links to the list filtered to that stage. The
  list is what walks a set that size, and it sorts and filters one; growing a second walk on the
  board would put a client-owned cache under every column, which a later server render cannot
  correct (see [0005](0005-a-write-shows-its-own-result.md)).
- Stage colour must split into two token families, since the four active stages want a sequential
  scale and the four outcomes want a categorical one. That is [0002](0002-design-token-architecture.md).
- The client's model of the state machine stays a convenience. The server's is the truth, so a
  refused move still has to be handled on a `422` even though the UI offered it.

## Alternatives considered

- **Eight columns.** Rejected for the three reasons above.
- **Four columns plus a single collapsed "Closed" column.** Better than eight, but a column implies
  droppability, and dropping onto it would still need a picker to choose among four outcomes — so
  it buys a worse affordance for the same interaction.
- **A separate archive route.** Rejected as a second place to look for applications; the list
  already filters, and a filter is one concept rather than two screens.
- **Counting the closed applications from `GET /api/v1/analytics/overview`**, which returns exact
  per-stage counts including the terminal four, is campaign-scoped, and is not gated. Rejected on
  consistency rather than cost: analytics is a projection built from events (backend ADR 0016), so
  its count lags the write. Closing an application would take the card out of its column
  immediately and leave the chip beside it reporting the old number, which puts two figures derived
  from different consistency domains on one screen. The bounded read is less precise and is on the
  same clock as the columns it sits above.
- **A "load more" under a truncated column.** Rejected because it makes each column a client-owned
  paginated cache, and the optimistic drag then has four caches to reconcile instead of a server
  render to receive.

## Revision history

- **2026-08-08 — original.** Four columns rather than eight, the close-out gesture, closed
  applications behind a filter on the list with a chip counting them, skips legal, and an
  unrecognised stage rendered in a fifth muted column.
- **2026-08-19 — the closed chip counts approximately.** The original said "a chip counting them"
  without asking what the API can count. It cannot: the list endpoint returns no totals, so the
  honest chip is one bounded read reporting "100+" above its ceiling. The analytics overview does
  return an exact figure and was rejected for being on a different clock; that is recorded under
  _Alternatives considered_ because it is the first thing a reader of the chip alone would propose.
- **2026-08-19 — the unrecognised-stage column is struck.** It cannot be reached. The board reads
  one request per column, each naming a single stage, and the endpoint narrows to the stages it was
  given — so no read can answer with a row in a stage that was not asked for. The instruction
  described a board that walked a combined list, which is not the board that was built. What
  replaces it is the limitation stated plainly under _Consequences_: a stage this client never asks
  for is invisible here, and the list is where it surfaces.
