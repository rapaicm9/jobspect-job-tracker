"use client";

import { useController, type FieldPathByValue, type FieldValues } from "react-hook-form";

import { Input } from "@/ui/input";

import type { FormControl } from "./control";
import { FieldShell } from "./field-shell";
import { messagesFor } from "./messages";

export interface DateTimeFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string>,
  TTransformedValues = TFieldValues,
> {
  control: FormControl<TFieldValues, TTransformedValues>;
  name: TName;
  label: string;
  description?: string;
}

/**
 * A date and a time, on the native control.
 *
 * What it hands over is a wall clock with no zone attached, and the zone it is
 * read in is the account's rather than this browser's - so the control says which
 * one in its description, and the form converts on the way out. Without that the
 * two disagree silently for anybody travelling, and the first sign of it is a
 * reminder arriving at the wrong hour.
 *
 * `DateField` is the one to reach for where the value is a calendar date. That
 * distinction is the whole of why there are two of these.
 */
export function DateTimeField<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string>,
  TTransformedValues = TFieldValues,
>({
  control,
  name,
  label,
  description,
}: DateTimeFieldProps<TFieldValues, TName, TTransformedValues>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <FieldShell label={label} description={description} messages={messagesFor(fieldState.error)}>
      {(binding) => (
        <Input
          {...binding}
          type="datetime-local"
          className="w-fit"
          name={field.name}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
          disabled={field.disabled}
        />
      )}
    </FieldShell>
  );
}
