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

import { ACTIVE_STAGES, type ActiveStage, type TerminalStage } from "@/lib/enums";
import { keyForIntent, type Intent } from "@/lib/idempotency";
import { Alert, AlertDescription } from "@/ui/alert";

import { closeCard } from "../actions/close-card";
import { moveCard } from "../actions/move-card";
import type { Board } from "../board";
import { applyOptimisticMove, CLOSE_OUT_TARGET, findCard, type OptimisticMove } from "../drag";
import { problemFor, type MoveOutcome } from "../move";

import { BoardColumns } from "./board-columns";
import { CloseOutDialog, type ClosingCard } from "./close-out-dialog";
import { CloseOutZone } from "./close-out-zone";

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

  /** Set by a drop on the close-out zone, cleared by picking or dismissing. */
  const [closing, setClosing] = useState<ClosingCard | null>(null);

  // Where the picker sends focus when it closes. See `CloseOutDialog`.
  const boardRef = useRef<HTMLDivElement>(null);

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

  /**
   * One optimistic move and the write behind it, whichever gesture raised it.
   *
   * Shared by the drag and the close-out because the two differ only in where the
   * card is going and which action is spoken to. Everything around that - the key,
   * the transition, what a refusal says - is one behaviour, and it was one switch
   * copied twice before this existed.
   */
  const move = (change: OptimisticMove, write: (key: string) => Promise<MoveOutcome>) => {
    intent.current = keyForIntent(intent.current, `${change.cardId}:${change.to}`);
    const { key } = intent.current;

    setProblem(null);

    startMoving(async () => {
      applyMove(change);

      const result = await write(key);

      // Spent. The next drag of this card is a new intent, even to the same
      // destination, because the first one is no longer in flight.
      if (result.kind === "moved") intent.current = null;

      setProblem(problemFor(result));
    });
  };

  const closeOut = (outcome: TerminalStage) => {
    if (closing === null) return;

    const { card, from } = closing;
    setClosing(null);

    move({ cardId: card.id, from, to: outcome }, (key) =>
      closeCard({ applicationId: card.id, outcome, idempotencyKey: key }),
    );
  };

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

        if (!isActiveStage(from)) return;

        // The close-out zone, checked before the column guard below because it is
        // the one target whose id is not a stage. Nothing is written and nothing
        // moves: the drop asks the question and the picker is where it is
        // answered, so a card that lifted out of its column here would be
        // claiming a decision the user has not made.
        if (to === CLOSE_OUT_TARGET) {
          const card = findCard(columns, cardId);
          if (card === undefined) return;

          setProblem(null);
          setClosing({ card, from });
          return;
        }

        // A drop back where it started is not a transition, and the pipeline
        // would refuse it by name. The accept rules already stop a backward drop
        // registering at all; this covers the same column.
        if (from === to) return;
        if (!isActiveStage(to)) return;

        move({ cardId, from, to }, (key) =>
          moveCard({ applicationId: cardId, targetStage: to, idempotencyKey: key }),
        );
      }}
    >
      {/* Focusable only programmatically, as the picker's landing place. */}
      <div ref={boardRef} tabIndex={-1} className="flex flex-col gap-4 outline-none">
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

        <CloseOutZone />
      </div>

      <CloseOutDialog
        closing={closing}
        onDismiss={() => {
          setClosing(null);
        }}
        onPick={closeOut}
        boardRef={boardRef}
      />
    </DragDropProvider>
  );
}
