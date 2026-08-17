"use client";

// Client-owned for two reasons, and the second is the one that matters: the field
// state has to survive a refusal, and the idempotency key for a new round has to
// be minted where the user commits. An action that minted its own would mint a
// second one on the second attempt, and one round would become two.

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { INTERVIEW_FORMATS, INTERVIEW_OUTCOMES, INTERVIEW_TYPES } from "@/lib/enums";
import { keyForIntent, type Intent } from "@/lib/idempotency";
import { accountZone } from "@/lib/instants";
import { DateTimeField } from "@/ui/fields/date-time-field";
import { FormActions, FormError } from "@/ui/fields/form-actions";
import { SelectField } from "@/ui/fields/select-field";
import { applyFieldErrors } from "@/ui/fields/server-errors";
import { TextareaField } from "@/ui/fields/textarea-field";

import { createInterview } from "../actions/create-interview";
import { updateInterview } from "../actions/update-interview";
import {
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_OUTCOME_LABELS,
  INTERVIEW_TYPE_LABELS,
  type Interview,
} from "../interview";
import {
  emptyFormValues,
  interviewFormSchema,
  toFormValues,
  type InterviewFormInput,
  type InterviewFormOutput,
} from "../interview-form-schema";
import { toCreateInterviewRequest, toUpdateInterviewRequest } from "../to-interview-request";

/** Every field this form renders, so a refusal naming another one is not lost. */
const FIELDS = ["scheduledAt", "type", "format", "outcome", "notes"] as const;

const GENERIC = "That interview has not been saved. Nothing was changed - please try again.";

const options = (labels: Record<string, string>, members: readonly string[]) =>
  members.map((member) => ({ value: member, label: labels[member] ?? member }));

export interface InterviewFormProps {
  applicationId: string;
  /** Null when scheduling a round rather than editing one. */
  interview: Interview | null;
  timeZoneId: string | null;
  onDone: () => void;
}

export function InterviewForm({
  applicationId,
  interview,
  timeZoneId,
  onDone,
}: InterviewFormProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // Held in a ref rather than in state: it must not cause a render, and the rule
  // that changed content is a new intent lives in `keyForIntent`.
  const intent = useRef<Intent | null>(null);

  const form = useForm<InterviewFormInput, unknown, InterviewFormOutput>({
    resolver: standardSchemaResolver(interviewFormSchema),
    // A field can break several rules at once, and only this reports more than
    // the first of them.
    criteriaMode: "all",
    defaultValues: interview === null ? emptyFormValues() : toFormValues(interview, timeZoneId),
  });

  const scheduleRound = (values: InterviewFormOutput) => {
    const body = toCreateInterviewRequest(values, timeZoneId);

    // Keyed to the body rather than to the form, because the API fingerprints
    // what it receives: resubmitting the same round reuses the key and is one
    // round, while changing a field before retrying is a new intent and needs a
    // new one.
    intent.current = keyForIntent(intent.current, JSON.stringify(body));

    return createInterview({ applicationId, idempotencyKey: intent.current.key, body });
  };

  const save = (values: InterviewFormOutput) => {
    setProblem(null);

    startSaving(async () => {
      const result = await (interview === null
        ? scheduleRound(values)
        : updateInterview({
            applicationId,
            interviewId: interview.id,
            body: toUpdateInterviewRequest(values, timeZoneId),
          }));

      switch (result.kind) {
        case "saved":
          // The panel is server rendered and the action has already invalidated
          // this route, so the refreshed tree arrives with the action's own
          // response and closing is all there is left to do.
          onDone();
          return;

        case "invalid": {
          const unplaced = applyFieldErrors(form.setError, result.fieldErrors, FIELDS);
          if (unplaced.length > 0) setProblem(unplaced.join(" "));
          return;
        }

        case "refused":
          // The API named the field and wrote the sentence. It knows which value
          // it refused better than a reconstruction here would.
          if ((FIELDS as readonly string[]).includes(result.field)) {
            form.setError(result.field as (typeof FIELDS)[number], {
              type: "server",
              message: result.detail,
            });
          } else {
            setProblem(result.detail);
          }
          return;

        case "in-flight":
          // Not a failure. The round is being written, and saying otherwise is
          // the message that makes somebody schedule it a second time.
          setProblem("This is still being saved. Give it a moment.");
          return;

        case "gone":
          setProblem("This no longer exists. Reload the page to see what is there now.");
          return;

        case "unavailable":
          setProblem("We could not reach the server. Nothing was saved - try again in a moment.");
          return;

        case "failed":
          setProblem(GENERIC);
      }
    });
  };

  return (
    <form
      // Built inside the handler rather than during render: `save` closes over
      // the intent ref, and handing that to `handleSubmit` while rendering is
      // reading a ref at render time.
      onSubmit={(event) => {
        void form.handleSubmit(save)(event);
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <DateTimeField
        control={form.control}
        name="scheduledAt"
        label="When"
        // Named, because this control cannot express a zone and the account's is
        // the one that counts: the backend computes this round's reminders from
        // it, so a time read in the browser's zone fires at the wrong hour.
        description={`In ${accountZone(timeZoneId)}, your account's timezone.`}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          control={form.control}
          name="type"
          label="Type"
          placeholder="Choose a type"
          options={options(INTERVIEW_TYPE_LABELS, INTERVIEW_TYPES)}
        />
        <SelectField
          control={form.control}
          name="format"
          label="Format"
          placeholder="Choose a format"
          options={options(INTERVIEW_FORMAT_LABELS, INTERVIEW_FORMATS)}
        />
      </div>

      {/* Only on an edit. The endpoint that schedules a round has no outcome at
          all - every new one is pending - so offering a choice here would be a
          control whose answer is thrown away. */}
      {interview !== null && (
        <SelectField
          control={form.control}
          name="outcome"
          label="Outcome"
          placeholder="Choose an outcome"
          options={options(INTERVIEW_OUTCOME_LABELS, INTERVIEW_OUTCOMES)}
          description="Cancelled is how a round is called off - there is no other way to withdraw one."
        />
      )}

      <TextareaField
        control={form.control}
        name="notes"
        label="Notes"
        placeholder="Who is on the panel, what to prepare, how it went."
      />

      <FormError message={problem} />

      <FormActions
        submitLabel={interview === null ? "Add interview" : "Save changes"}
        pendingLabel={interview === null ? "Adding…" : "Saving…"}
        pending={isSaving}
        onCancel={onDone}
      />
    </form>
  );
}
