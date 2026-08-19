# 0005 — A write shows its own result, in one round trip

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

The application detail screen is two things at once. The header, the facts and the stage chip are
server-rendered; the activity timeline is a client cache, seeded by the server's first page and
walked from the browser with a cursor. A write that changes both halves has to move both, or the
screen contradicts itself — the stage says Interview and the history has never heard of it.

Three writes on that screen arrived at the same rule by different routes. Creating an application
redirects from inside its action. Editing one revalidates from inside its action. The transition menu
did neither: it called `router.refresh()` for the server-rendered half and a second Server Action
through `refetchQueries` for the timeline, and needed both to land. Nothing ordered them.

Two properties of the libraries involved make that arrangement unrepairable rather than merely
racy, and both are behaving exactly as designed:

- **A lost refetch is silent.** TanStack Query wraps each fetch it triggers in a rejection handler
  that discards the error, and `useInfiniteQuery` keeps its previous data when a fetch fails. A
  dropped request leaves the timeline holding what it already had, with nothing rendered to say so.
- **A later server render cannot correct it.** `router.refresh()` merges the new payload _while
  preserving client state_ — that is its documented purpose — and the cache is client state. The
  fresh first page it delivers arrives as `initialData`, which the query library applies only when
  the query holds no data. For a cache that has already been seeded it is inert.

So the server can compute the correct answer, send it, and have the client discard it, permanently.
This was demonstrated rather than reasoned: with the follow-up request aborted, the stage moved in
the header and the timeline showed only the seeded entry across twenty-four polls over ten seconds.
Restoring the follow-up request reproduces it on demand.

One further observation, recorded because it is easy to misread. Across ten consecutive moves the
refresh's request consistently _started_ after the refetch that was called after it — the arrangement
was not a race in initiation order, it was a follow-up request that could be lost with no second
chance behind it. Nothing in the framework's documentation describes that ordering, so it is recorded
here as a measurement and not as a rule to rely on.

## Decision

**A write invalidates from inside its own action, and the client never issues a second server
request to see the result of a write it has just made.**

**Where part of the screen is a client cache, the action returns the data that cache needs**, and the
component writes it in directly. The pipeline transition returns the timeline's fresh first page
beside its outcome; the component replaces the walk with it. Restarting the walk, rather than
splicing the new entry into the page already loaded, is what keyset paging requires: a new entry at
the head shifts every page boundary behind it, so replacing page one alone would drop whatever used
to sit at its tail. The timeline is newest-first, so the new entry is at the top either way and the
rest is a "Load more" away.

**When the action cannot return that data, the client does nothing.** No retry, no invalidation, no
follow-up fetch. The panel is one entry behind until the next ordinary read of the screen, and the
write itself is visible in the half that is server-rendered. A request issued at that moment would
race the re-rendered page the same response is still delivering, which is the failure this record
exists to remove.

Idempotency is unaffected: keys are still minted per user intent in the client component and reused
across retries of that intent, as backend ADR 0011 requires.

## Consequences

- **The activity endpoint is read twice per move** — once by the action for the answer it returns,
  once by the re-render the same action triggers. `React.cache` does not span the two, since the
  render is a separate cache scope. The cost is one API call against the previous design's whole
  second page render plus a second action round trip.
- **The rule is enforced by a test rather than by review.** A spec aborts every request after the
  move's own and asserts the entry still appears. It passes vacuously today, because there is no
  second request to abort, and goes red the moment somebody adds one back. Restoring the old shape
  turns it red, which is how it was checked rather than trusted.
- **Assertions on this screen run on the default timeout.** The inflated fifteen-second budgets
  covered an action, an API call, a whole-page re-render and a refetch in sequence; a longer budget
  hides this defect rather than catching it, and there is now nothing for one to absorb.
- **A failure branch that cannot repair itself has to say nothing rather than guess.** The degraded
  panel is the accepted outcome, and the alternative was measured (below) rather than argued.

## Alternatives considered

- **`router.refresh()` after the action, plus a refetch.** The arrangement described above. It is
  the one this record exists to retire.
- **Revalidating inside the action _and_ keeping the two client round trips.** Tried and measured
  before this record: it made the failure more frequent, not less, by adding a third server render to
  the same sequence without removing either request.
- **Invalidating the query on the failure branch**, so the timeline catches up when the action's own
  read of it fails. Implemented, then measured at **two failures in twenty repeats** — and the
  assertion that failed was the _header_, because the invalidation's request collided with the
  re-rendered page still being delivered. It reproduced this record's own defect inside its fix,
  which is why the branch now does nothing at all.
- **Removing the cache entry so the fresh `initialData` seeds it again.** Rejected as racy in the
  other direction: whether the component re-seeds from the stale prop or the fresh one depends on
  when the merge lands relative to the removal.
- **Versioning the query key on the resource's `updatedAt`.** It works, and it pushes the key into
  every consumer of the timeline while resetting an in-progress walk on edits that have nothing to do
  with the history.
- **Ordering the two requests explicitly**, awaiting the refresh before the refetch. Leaves in place
  the design that produced the defect and adds a sequencing rule that every future caller has to know.
