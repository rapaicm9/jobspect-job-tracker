"use client";

import { useController, type FieldPathByValue, type FieldValues } from "react-hook-form";

import { Textarea } from "@/ui/textarea";

import type { FormControl } from "./control";
import { FieldShell } from "./field-shell";
import { messagesFor } from "./messages";

export interface TextareaFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string>,
  TTransformedValues = TFieldValues,
> {
  control: FormControl<TFieldValues, TTransformedValues>;
  name: TName;
  label: string;
  description?: string;
  placeholder?: string;
  rows?: number;
}

/**
 * Several lines of text.
 *
 * No `maxLength`, here or anywhere: a hard cap truncates a paste without saying
 * so, and the API answers an over-long value with a message keyed to the field,
 * which is both the better thing to show and the only place the limit is
 * written once.
 */
export function TextareaField<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string>,
  TTransformedValues = TFieldValues,
>({
  control,
  name,
  label,
  description,
  placeholder,
  rows = 3,
}: TextareaFieldProps<TFieldValues, TName, TTransformedValues>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <FieldShell label={label} description={description} messages={messagesFor(fieldState.error)}>
      {(binding) => (
        <Textarea
          {...binding}
          rows={rows}
          placeholder={placeholder}
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
