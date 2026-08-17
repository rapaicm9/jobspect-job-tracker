"use client";

import { useId } from "react";

import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/ui/field";

/**
 * What a control has to be handed so the label, the hint and the messages all
 * belong to it rather than sitting near it.
 */
export interface ControlBinding {
  id: string;
  /**
   * Stated either way rather than omitted when the field is fine. A control
   * that says `false` has answered the question; one that says nothing leaves
   * it open, and only one of those two is worth reading out loud.
   */
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}

interface Wiring {
  binding: ControlBinding;
  descriptionId: string;
  errorsId: string;
  invalid: boolean;
}

function useWiring(messages: string[], description: string | undefined): Wiring {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorsId = `${id}-errors`;
  const invalid = messages.length > 0;

  // The complaint before the standing hint: what is wrong right now is what the
  // reader needs first, and the rule they broke still follows it.
  const describedBy =
    [invalid ? errorsId : undefined, description === undefined ? undefined : descriptionId]
      .filter((value) => value !== undefined)
      .join(" ") || undefined;

  return {
    binding: { id, "aria-invalid": invalid, "aria-describedby": describedBy },
    descriptionId,
    errorsId,
    invalid,
  };
}

export interface FieldShellProps {
  label: string;
  /** A hint, read alongside the messages rather than replaced by them. */
  description?: string;
  messages: string[];
  children: (binding: ControlBinding) => React.ReactNode;
}

/**
 * Label, control, hint and messages, wired together once.
 *
 * The join is the whole reason this exists: a hint and an error list both have
 * to reach `aria-describedby`, and a field that loses its hint the moment it
 * goes wrong takes away the instruction exactly when it is needed. Hand-rolling
 * that per form is how one of them ends up missing.
 */
export function FieldShell({ label, description, messages, children }: FieldShellProps) {
  const { binding, descriptionId, errorsId, invalid } = useWiring(messages, description);

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={binding.id}>{label}</FieldLabel>

      {children(binding)}

      {description !== undefined && (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}

      <FieldError id={errorsId} messages={messages} />
    </Field>
  );
}

export interface FieldSetShellProps {
  legend: string;
  description?: string;
  messages: string[];
  children: (binding: ControlBinding) => React.ReactNode;
}

/**
 * The same wiring for a group of controls that answer one question together.
 *
 * A legend rather than a label, because a `<label>` belongs to one control and
 * this describes several. The binding's id is a stem the group derives its own
 * ids from; the messages and the hint are shared, since what is wrong is wrong
 * about the group.
 */
export function FieldSetShell({ legend, description, messages, children }: FieldSetShellProps) {
  const { binding, descriptionId, errorsId, invalid } = useWiring(messages, description);

  return (
    <FieldSet data-invalid={invalid || undefined}>
      <FieldLegend variant="label">{legend}</FieldLegend>

      {description !== undefined && (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      )}

      {children(binding)}

      <FieldError id={errorsId} messages={messages} />
    </FieldSet>
  );
}
