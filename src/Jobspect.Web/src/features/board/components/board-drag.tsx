"use client";

// The gesture, the write and the refusal.
//
// Nothing here is bound into a Server Action: `moveCard` is called with an object
// from this handler, so there are no bound arguments - the same rule the
// transition menu follows, since a closed-over value is encrypted with the action
// id and a bound one is not.
//
// There is deliberately no `<DragOverlay>`. dnd-kit's default feedback already
// lifts the card into an overlay of its own and moves it, and collision is
// measured against that. Rendering a second one leaves the real draggable sitting
// in its original column, so every drop resolves to the column the card started
// in - or, once the accept rules are on, to nothing at all.

import { StyleInjector } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { ACTIVE_STAGES, type ActiveStage } from "@/lib/enums";
import { keyForIntent, type Intent } from "@/lib/idempotency";
import { Alert, AlertDescription } from "@/ui/alert";

import { moveCard } from "../actions/move-card";
import type { Board } from "../board";
import { applyOptimisticMove } from "../drag";

import { BoardColumns } from "./board-columns";

export interface BoardDragProps {
  board: Board;
  campaignId: string | null;
  /**
   * The request's CSP nonce, read by the page and handed down.
   *
   * dnd-kit injects a stylesheet when a drag starts - it is what positions the
   * lifted card and sets the grab cursor - and `style-src` here is nonce-based
   * with no `'unsafe-inline'`, so an untagged `<style>` element is refused. The
   * visible symptom is a card that lifts and then sits in the top-left corner of
   * the page instead of following the pointer, which reads as a broken drag
   * rather than as a blocked stylesheet.
   */
  nonce: string;
}

function isActiveStage(value: string): value is ActiveStage {
  return (ACTIVE_STAGES as readonly string[]).includes(value);
}

export function BoardDrag({ board, campaignId, nonce }: BoardDragProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [, startMoving] = useTransition();

  /**
   * The move as it looks before the server has answered.
   *
   * React renders this only while the action is in flight and then goes back to
   * whatever the base value is - here, the columns the server last rendered. Two
   * things follow, and they are the whole design of this screen:
   *
   * A refusal needs no rollback code. Nothing ever really moved, so when the
   * action settles the card is simply back where it was.
   *
   * A success sticks because a Server Action re-renders the route it was called
   * from and returns that payload with its own response, so the base value has
   * already become the board holding the card in its new column by the time the
   * optimistic one stops rendering. There is nothing to refresh and nothing to
   * refetch: a request issued here would race the re-render this very response is
   * delivering, which is the defect the commit before this one removed.
   */
  const [columns, applyMove] = useOptimistic(board.columns, applyOptimisticMove);

  // The key belongs to the destination, so dropping the same card on the same
  // column twice is one intent and dropping it elsewhere is another.
  const intent = useRef<Intent | null>(null);

  return (
    <DragDropProvider
      // Every default kept, with the one plugin that writes a stylesheet swapped
      // for a copy that nonces it. Replacing the array outright would drop the
      // keyboard sensor's accessibility plugin and the auto-scroller with it.
      plugins={(defaults) => [
        ...defaults.filter((plugin) => plugin !== StyleInjector),
        StyleInjector.configure({ nonce }),
      ]}
      onDragEnd={(event) => {
        const { source, target } = event.operation;

        // Dropped on nothing, or let go with Escape. Neither is a move.
        //
        // `== null` rather than `=== null`, and it is not a style choice: the
        // types say `Droppable | null` and a drop onto no valid target arrives as
        // `undefined`, which a strict comparison lets straight through into a
        // read of `target.id`.
        if (event.canceled || source == null || target == null) return;

        const cardId = String(source.id);
        const from = String(source.type ?? "");
        const to = String(target.id);

        // A drop back where it started is not a transition, and the pipeline
        // would refuse it by name. The accept rules already stop a backward drop
        // registering at all; this covers the same column.
        if (from === to) return;
        if (!isActiveStage(from) || !isActiveStage(to)) return;

        intent.current = keyForIntent(intent.current, `${cardId}:${to}`);
        const { key } = intent.current;

        setProblem(null);

        startMoving(async () => {
          applyMove({ cardId, from, to });

          const result = await moveCard({
            applicationId: cardId,
            targetStage: to,
            idempotencyKey: key,
          });

          switch (result.kind) {
            case "moved":
              // Spent. The next drag of this card is a new intent, even to the
              // same column, because the first one is no longer in flight.
              intent.current = null;
              return;

            case "illegal":
              // The server's own sentence, which names both stages. It happens
              // when this tab's board is stale - another tab moved the card, and
              // nothing invalidates a Router Cache across tabs.
              setProblem(result.detail);
              return;

            case "unavailable":
              setProblem("The pipeline could not be reached just now. Try again in a moment.");
              return;

            case "in-flight":
              setProblem("This move is still being applied. Give it a moment.");
              return;

            case "rate-limited":
              // The one refusal where "try again" is the wrong advice, so it says
              // how long instead whenever the API named a figure.
              setProblem(
                result.retryAfterSeconds === null
                  ? "Too many requests just now. Wait a moment before moving anything else."
                  : `Too many requests just now. Try again in ${String(result.retryAfterSeconds)} seconds.`,
              );
              return;

            case "failed":
              setProblem("That move did not go through. Try again.");
          }
        });
      }}
    >
      <div className="flex flex-col gap-4">
        {problem !== null && (
          // One region rather than one per card: by the time this renders the
          // card is back in the column it came from, which may be scrolled out of
          // view. `role="alert"` is what announces the refusal - the successful
          // outcomes join it in the commit that owns announcements.
          <Alert variant="destructive" role="alert">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}

        <BoardColumns columns={columns} campaignId={campaignId} />
      </div>
    </DragDropProvider>
  );
}
