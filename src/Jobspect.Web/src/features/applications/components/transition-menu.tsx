"use client";

// Client-owned for the reason the composer is: the idempotency key is minted
// where the intent forms, which is the moment the user picks a destination.
//
// Nothing here is bound into a Server Action. Both actions are called with an
// object from this handler, so there are no bound arguments - which is what §9
// asks for, since a closed-over value is encrypted with the action id and a
// bound one is not.

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { keyForIntent, type Intent } from "@/lib/idempotency";
import type { Stage } from "@/lib/enums";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

import { advanceApplication } from "../actions/advance-application";
import { closeApplication } from "../actions/close-application";
import { activityQueryKey } from "../activity-reading";
import type { TransitionResult } from "../request-transition";

import { StageChip } from "./stage-chip";

export interface TransitionMenuProps {
  applicationId: string;
  /** Computed on the server, where the stage lists live. */
  advanceTo: Stage[];
  closeAs: Stage[];
}

export function TransitionMenu({ applicationId, advanceTo, closeAs }: TransitionMenuProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [problem, setProblem] = useState<string | null>(null);
  const [isMoving, startMoving] = useTransition();

  // The key belongs to the destination, so picking Interview twice is one intent
  // and picking Offer instead is another. `keyForIntent` holds that rule.
  const intent = useRef<Intent | null>(null);

  const move = (targetStage: Stage, closing: boolean) => {
    intent.current = keyForIntent(intent.current, targetStage);
    const { key } = intent.current;

    setProblem(null);

    startMoving(async () => {
      const result: TransitionResult = closing
        ? await closeApplication({ applicationId, outcome: targetStage, idempotencyKey: key })
        : await advanceApplication({ applicationId, targetStage, idempotencyKey: key });

      switch (result.kind) {
        case "moved":
          intent.current = null;
          // Two halves of one screen: the chip, the facts and the header are
          // server-rendered, and the timeline is a client cache that has just
          // gained a stage-change entry it cannot know about.
          router.refresh();
          // Awaited on purpose. A refetch left in flight is one the next render
          // can drop, and the move is not finished being shown until the history
          // shows it - so the control stays busy until both halves agree.
          await queryClient.refetchQueries({ queryKey: activityQueryKey(applicationId) });
          return;

        case "illegal":
          // The server's own sentence, which names both stages. The client's
          // model of the pipeline is a convenience; this is the truth, and it
          // says it better than a reconstruction would.
          setProblem(result.detail);
          return;

        case "unavailable":
          setProblem("The pipeline could not be reached just now. Try again in a moment.");
          return;

        case "in-flight":
          setProblem("This move is still being applied. Give it a moment.");
          return;

        case "failed":
          setProblem("That move did not go through. Try again.");
      }
    });
  };

  const hasMoves = advanceTo.length > 0 || closeAs.length > 0;

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" size="sm" disabled={isMoving || !hasMoves}>
              {isMoving ? "Moving…" : "Move"}
              <ChevronDown aria-hidden="true" className="size-4" />
            </Button>
          }
        />

        <DropdownMenuContent align="end">
          {advanceTo.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {advanceTo.map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  onClick={() => {
                    move(stage, false);
                  }}
                >
                  <StageChip stage={stage} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}

          {/* Closing is a different kind of move, which is the distinction the
              board's close-out drop zone makes visible with a separate gesture.
              Here it is a group of its own. */}
          {advanceTo.length > 0 && closeAs.length > 0 && <DropdownMenuSeparator />}

          {closeAs.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel>Close out</DropdownMenuLabel>
              {closeAs.map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  onClick={() => {
                    move(stage, true);
                  }}
                >
                  <StageChip stage={stage} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {!hasMoves && (
        // A stage this build does not recognise. Saying so beats a menu that
        // offers moves nobody can predict the outcome of.
        <p className="text-sm text-muted-foreground">
          This application is at a stage this version does not know, so it cannot be moved here.
        </p>
      )}

      {problem !== null && (
        <Alert variant="destructive" className="sm:max-w-sm">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
