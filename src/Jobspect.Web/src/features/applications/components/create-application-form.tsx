"use client";

// Client-owned for two reasons, and the second is the one that matters: the
// field state has to survive a refusal, and the idempotency key has to be minted
// where the user commits. An action that minted its own would mint a second one
// on the second attempt, and one application would become two.

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { withCampaignScope } from "@/features/campaigns";
import { keyForIntent, type Intent } from "@/lib/idempotency";
import { DateField } from "@/ui/fields/date-field";
import { FormActions, FormError } from "@/ui/fields/form-actions";
import { MoneyField } from "@/ui/fields/money-field";
import { SelectField } from "@/ui/fields/select-field";
import { applyFieldErrors } from "@/ui/fields/server-errors";
import { TextField } from "@/ui/fields/text-field";

import { createApplication } from "../actions/create-application";
import {
  createApplicationFormSchema,
  emptyFormValues,
  type CreateApplicationFormInput,
  type CreateApplicationFormOutput,
} from "../application-form-schema";
import { toCreateRequest } from "../to-create-request";

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
  "compensation",
] as const;

const GENERIC = "That application has not been saved. Nothing was created - please try again.";

export interface CreateApplicationFormProps {
  workModes: readonly string[];
  sourceSuggestions: readonly string[];
  /** The scope off the URL: which campaign this opens in, and where cancel goes. */
  campaignId: string | null;
}

export function CreateApplicationForm({
  workModes,
  sourceSuggestions,
  campaignId,
}: CreateApplicationFormProps) {
  const router = useRouter();
  const listHref = withCampaignScope("/applications", campaignId);

  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // Held in a ref rather than in state: it must not cause a render, and the rule
  // that changed content is a new intent lives in `keyForIntent`.
  const intent = useRef<Intent | null>(null);

  const form = useForm<CreateApplicationFormInput, unknown, CreateApplicationFormOutput>({
    resolver: standardSchemaResolver(createApplicationFormSchema),
    criteriaMode: "all",
    defaultValues: emptyFormValues(),
  });

  const save = (values: CreateApplicationFormOutput) => {
    const body = toCreateRequest(values, campaignId);

    // Keyed to the body rather than to the form, because the API fingerprints
    // what it receives: resubmitting the same application reuses the key and is
    // one application, while changing a field before retrying is a new intent
    // and needs a new one.
    intent.current = keyForIntent(intent.current, JSON.stringify(body));
    const { key } = intent.current;

    setProblem(null);

    startSaving(async () => {
      const result = await createApplication({ idempotencyKey: key, body });

      // Success never arrives here: the action redirects to the list, which is
      // what keeps the invalidation and the navigation in one response rather
      // than in two that race each other.
      switch (result.kind) {
        case "invalid": {
          const unplaced = applyFieldErrors(form.setError, result.fieldErrors, FIELDS);
          if (unplaced.length > 0) setProblem(unplaced.join(" "));
          return;
        }

        case "refused":
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
          // Not a failure. The application is being written, and saying otherwise
          // is the message that makes somebody submit it a second time.
          setProblem("This is still being saved. Give it a moment.");
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
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField control={form.control} name="role" label="Role" />
        <TextField
          control={form.control}
          name="companyName"
          label="Company"
          description="Matched to a company you already have, or recorded as a new one."
        />

        <DateField
          control={form.control}
          name="appliedDate"
          label="Applied"
          // Left blank rather than prefilled. The API fills an absent one with
          // today in this account's own timezone, and computing that here would
          // state the same rule twice.
          description="Today, unless you set another date."
        />
        <DateField control={form.control} name="applicationDeadline" label="Application deadline" />

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
        <TextField
          control={form.control}
          name="postingUrl"
          label="Posting"
          type="url"
          placeholder="https://"
        />

        <TextField control={form.control} name="cvLabel" label="CV" />
        <TextField control={form.control} name="coverLetterLabel" label="Cover letter" />
      </div>

      <MoneyField control={form.control} name="compensation" legend="Compensation" />

      <FormError message={problem} />

      <FormActions
        submitLabel="Add application"
        pendingLabel="Adding…"
        pending={isSaving}
        onCancel={() => {
          router.push(listHref);
        }}
      />
    </form>
  );
}
