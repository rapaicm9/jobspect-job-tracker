# 0003 — Full-replace writes, and the gated field that hides in them

- **Status:** Accepted
- **Date:** 2026-08-15

## Context

`PUT /api/v1/applications/{id}` replaces an application rather than patching it. Every property in
`UpdateApplicationRequest` is required, so a body that omits one does not fail to compile — the
generated type refuses that outright. The mistake it leaves open is a body that sends `null` where
it meant "keep this", which the handler applies faithfully and which the screen cannot show
afterwards, because a cleared field and a field that was always empty render identically.

One property makes this worse than a mistyped value. `customFields` is gated on an entitlement, and
the API reads its absence in opposite directions depending on the caller:

- an account **without** the entitlement has an absent bag read as _unchanged_, so it can go on
  editing the rest of an application forever without its answers draining away;
- an account **with** it has an absent bag read as _cleared_, because for that caller the bag is an
  ordinary field of a full replace.

Both readings are right, and together they mean the same request body preserves data or destroys it
depending on a fact the client only learns by asking. Backend ADR 0004 and backend ADR 0005 settle
the storage and the entitlement respectively; this record settles what a client does about them.

There is a third state neither of those anticipates. The client's plan tier is a hand-maintained
union, so a server that grows a tier this build has never heard of yields a tier of `null` — read
as "not Pro" everywhere else in this codebase, safely, because everywhere else the consequence of
guessing low is a locked panel.

## Decision

**Every write on this client that targets a full-replace endpoint hydrates from the matching `GET`
and sends the complete DTO.** There is no partial-save affordance anywhere: no per-field save, no
inline single-field edit, no PATCH-shaped action. A form opens with every editable value already in
it or it does not open.

**The body is assembled by one pure function per resource**, taking the view model that was read,
the form's parsed output and the entitlement context, and returning the whole request. Nothing
constructs a body inline at a call site. That function is the only place the round-trip rule is
expressed, and it is the only place a test has to look.

**Its test is keyed off the request's own shape.** A fixture in which no two fields share a value,
one field edited, and every other property asserted against a hand-written expectation — not
against a second call of the same function, which agrees with itself however wrong both are. A
property added to the request later fails that test until somebody decides what it is worth.

**The gated portion follows the tier, on three branches rather than two:**

| Tier read    | `customFields` sent   | Why                                                 |
| ------------ | --------------------- | --------------------------------------------------- |
| Not entitled | `null`                | Retains. Anything non-null is refused outright.     |
| Entitled     | the hydrated map      | `null` would clear.                                 |
| Unrecognised | the map, if non-empty | A refusal is recoverable; a silent clearing is not. |

The third row is the one worth arguing. Reading an unknown tier as unentitled — the safe default
everywhere else — would send `null` for an account that may in fact write, and clear answers nobody
asked to remove, with no error and no trace. Sending the map instead risks only a `403` carrying
`custom_field.not_entitled`, which names itself, changes nothing, and can be shown to the user. An
empty bag means the same thing under either reading, so it takes the quieter option.

**Answers keyed to an archived definition are dropped from the body.** The API refuses any write
naming an archived field, so an application that answered a field which has since been retired
would otherwise have every edit of every other field refused along with it.

**A field the user may not currently change is rendered read-only, never disabled.** React Hook Form
treats a disabled field as absent and drops it from the submitted values, which against a replace is
indistinguishable from clearing it. Read-only keeps the value in the form and in the request. The
offer-decision deadline is the case that forced this: the API compares it against what is stored and
refuses a _change_ made while the application is not at `Offer`, so re-sending the recorded value has
to keep working.

## Consequences

- Every write endpoint of this shape costs a read first. Editing is never available on a screen that
  has not already loaded the resource, which is true of every screen that offers it.
- The entitlement is read before a body can be assembled, so the plan read sits on the same page as
  the form rather than behind the button that opens it.
- An account on an unrecognised tier with custom-field answers cannot edit its applications until
  the client's tier union is updated. This is deliberate: the alternative is that it can, and loses
  the answers. The enum-agreement suite fails CI the moment the contract grows a tier, so reaching
  this state needs a deployed client against a newer server.
- The one-pure-function rule means the mapper, not the form, is what a reviewer has to read to know
  whether a write is safe.

## Alternatives considered

- **Send only the fields the form shows.** Rejected outright: the fields it does not show are the
  ones nobody would notice disappearing.
- **Treat an unrecognised tier as entitled in all cases**, sending the map even when the bag is
  empty. Rejected as noise: an empty bag cannot lose anything, so the refusal would buy nothing and
  block an edit that was safe.
- **Ask the API which fields are writable.** There is no such endpoint, and adding one would move a
  client concern into the contract.
- **Disable the offer-decision deadline off `Offer`.** Rejected on the mechanism above — it is the
  single change most likely to be made by somebody who has not read this record, which is why it is
  in it.
