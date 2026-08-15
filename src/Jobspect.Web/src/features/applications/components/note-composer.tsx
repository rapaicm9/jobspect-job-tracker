"use client";

// Client-owned because the intent is formed here: §5.1 puts the idempotency key
// in the component that owns the gesture, minted when the user commits, so that
// a retry of one note is one note. An action that minted its own would mint a
// second one on the second call, which is the whole failure the header guards.

import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useRef, useState, useTransition } from "react";

import { keyForIntent, type Intent } from "@/lib/idempotency";
import { Button } from "@/ui/button";
import { FieldShell } from "@/ui/fields/field-shell";
import { Textarea } from "@/ui/textarea";

import { addNote } from "../actions/add-note";
import { activityQueryKey, type TimelinePage } from "../activity-reading";
import type { ActivityEntry } from "../to-activity-entry";

export interface NoteComposerProps {
  applicationId: string;
}

export function NoteComposer({ applicationId }: NoteComposerProps) {
  const queryClient = useQueryClient();
  const queryKey = activityQueryKey(applicationId);

  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  // Held across attempts in a ref rather than in state: it must not cause a
  // render, and the rule that changed text is a new intent lives in
  // `keyForIntent` rather than here.
  const intent = useRef<Intent | null>(null);

  /**
   * The entry the API created, not one built here: its id and instant are the
   * server's. A newest-first walk means the head is where a new entry belongs and
   * no cursor already issued is disturbed, so nothing is refetched and no loaded
   * page moves.
   */
  const prepend = (entry: ActivityEntry) => {
    queryClient.setQueryData<InfiniteData<TimelinePage, string | null>>(queryKey, (current) => {
      const [first, ...rest] = current?.pages ?? [];
      if (current === undefined || first === undefined) return current;

      return { ...current, pages: [{ ...first, entries: [entry, ...first.entries] }, ...rest] };
    });
  };

  const submit = () => {
    const trimmed = note.trim();
    if (trimmed === "") return;

    intent.current = keyForIntent(intent.current, trimmed);
    const { key } = intent.current;

    setFieldErrors([]);
    setProblem(null);

    startSubmitting(async () => {
      const result = await addNote({ applicationId, note: trimmed, idempotencyKey: key });

      switch (result.kind) {
        case "added":
          prepend(result.entry);
          setNote("");
          // The intent is spent. The next note is a new one and needs its own key.
          intent.current = null;
          return;

        case "invalid":
          setFieldErrors(result.fieldErrors.note ?? []);
          return;

        case "in-flight":
          // The action has already waited and asked again, so this is the slow
          // case rather than the ordinary one. Still not a failure: the note is
          // being written, and saying it was not would be the one wrong thing.
          setProblem("This note is still being saved. Give it a moment.");
          return;

        case "failed":
          setProblem("That note has not been saved. Try again.");
      }
    });
  };

  const messages = problem === null ? fieldErrors : [...fieldErrors, problem];

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FieldShell label="Add a note" messages={messages}>
        {(binding) => (
          <Textarea
            {...binding}
            name="note"
            rows={3}
            // No `maxLength`. A hard cap truncates a paste without saying so, and
            // the API answers an over-long note with a message keyed to this
            // field - which is both the better thing to show and the only place
            // the rule is stated once. The empty case is guarded below because
            // that one costs a round trip to learn nothing.
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            placeholder="A call, a follow-up, anything worth remembering."
            disabled={isSubmitting}
          />
        )}
      </FieldShell>

      <Button
        type="submit"
        size="sm"
        className="w-fit"
        disabled={isSubmitting || note.trim() === ""}
      >
        {isSubmitting ? "Adding…" : "Add note"}
      </Button>
    </form>
  );
}
