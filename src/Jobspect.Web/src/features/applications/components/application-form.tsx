"use client";

// Client-owned because the whole point is state that survives a refusal: a form
// that re-rendered from the server on every failed submit would throw away
// fourteen fields to report one.

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import type { PlanTier } from "@/lib/enums";
import { DateField } from "@/ui/fields/date-field";
import { FormActions, FormError } from "@/ui/fields/form-actions";
import { MoneyField } from "@/ui/fields/money-field";
import { SelectField } from "@/ui/fields/select-field";
import { applyFieldErrors } from "@/ui/fields/server-errors";
import { TextField } from "@/ui/fields/text-field";

import { updateApplication } from "../actions/update-application";
import type { ApplicationDetail } from "../application-detail";
import {
  applicationFormSchema,
  toFormValues,
  type ApplicationFormInput,
  type ApplicationFormOutput,
} from "../application-form-schema";
import type { CustomFieldDefinition } from "../custom-field-answers";
import { toUpdateRequest } from "../to-update-request";

/** Every field this form renders, so a refusal naming another one is not lost. */
const FIELDS = [
  "role",
  "companyName",
  "source",
  "location",
  "postingUrl",
  "cvLabel",
  "coverLetterLabel",
  "workMode",
  "appliedDate",
  "applicationDeadline",
  "offerDecisionDeadline",
  "compensation",
] as const;

const GENERIC = "That change has not been saved. Nothing was altered - please try again.";

export interface ApplicationFormProps {
  application: ApplicationDetail;
  definitions: readonly CustomFieldDefinition[];
  tier: PlanTier | null;
  workModes: readonly string[];
  /**
   * Read by whatever opened this form, so the request is a consequence of the
   * user's click rather than of a render. Empty is a valid answer and leaves an
   * ordinary text box behind.
   */
  sourceSuggestions: readonly string[];
  onDone: () => void;
}

export function ApplicationForm({
  application,
  definitions,
  tier,
  workModes,
  sourceSuggestions,
  onDone,
}: ApplicationFormProps) {
  const router = useRouter();

  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const form = useForm<ApplicationFormInput, unknown, ApplicationFormOutput>({
    resolver: standardSchemaResolver(applicationFormSchema),
    // A field can break several rules at once, and only this reports more than
    // the first of them.
    criteriaMode: "all",
    defaultValues: toFormValues(application),
  });

  const editable = application.stage === "Offer";

  const save = (values: ApplicationFormOutput) => {
    setProblem(null);

    startSaving(async () => {
      const result = await updateApplication({
        applicationId: application.id,
        body: toUpdateRequest(application, values, { tier, definitions }),
      });

      switch (result.kind) {
        case "saved":
          // The header, the facts and the last-updated instant are all server
          // rendered, so the read view has to come back from the server rather
          // than be reconstructed here. Nothing touches the timeline: an edit
          // writes no activity entry.
          onDone();
          router.refresh();
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

        case "not-entitled":
          // Reached only when this build read a tier it did not recognise and
          // sent the answers anyway. Nothing was changed, which is the whole
          // reason that guess errs this way.
          setProblem(
            "Custom fields are part of Pro, so this change was not saved. Nothing was altered.",
          );
          return;

        case "gone":
          setProblem("This application no longer exists.");
          router.refresh();
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
    <form onSubmit={form.handleSubmit(save)} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField control={form.control} name="role" label="Role" />
        <TextField
          control={form.control}
          name="companyName"
          label="Company"
          description="Leave it as it is to keep the company on record, or type another to move it."
        />

        <DateField control={form.control} name="appliedDate" label="Applied" />
        <DateField control={form.control} name="applicationDeadline" label="Application deadline" />

        <DateField
          control={form.control}
          name="offerDecisionDeadline"
          label="Offer decision by"
          readOnly={!editable}
          description={
            editable
              ? undefined
              : "Only editable while the application is at Offer, so this keeps the date it was given."
          }
        />

        <SelectField
          control={form.control}
          name="workMode"
          label="Work mode"
          options={workModes.map((mode) => ({ value: mode, label: mode }))}
        />

        <TextField control={form.control} name="location" label="Location" />
        <TextField
          control={form.control}
          name="source"
          label="Source"
          suggestions={sourceSuggestions}
          description="Where this came from. Anything you have used before is offered as you type."
        />

        <TextField control={form.control} name="cvLabel" label="CV" />
        <TextField control={form.control} name="coverLetterLabel" label="Cover letter" />

        <TextField
          control={form.control}
          name="postingUrl"
          label="Posting"
          type="url"
          placeholder="https://"
        />
      </div>

      <MoneyField control={form.control} name="compensation" legend="Compensation" />

      <FormError message={problem} />

      <FormActions
        submitLabel="Save changes"
        pendingLabel="Saving…"
        pending={isSaving}
        onCancel={onDone}
      />
    </form>
  );
}
