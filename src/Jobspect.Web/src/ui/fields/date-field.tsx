"use client";

import { useController, type FieldPathByValue, type FieldValues } from "react-hook-form";

import { Input } from "@/ui/input";

import type { FormControl } from "./control";
import { FieldShell } from "./field-shell";
import { messagesFor } from "./messages";

export interface DateFieldProps<
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
 * A calendar date, on the native control.
 *
 * No calendar popover and no date library. The native input is already
 * keyboard-operable and already localised by the browser, and what it hands
 * over is `yyyy-mm-dd` - the API's own date format, so the value travels as
 * written with no zone to place it in.
 *
 * An instant is a different problem. Anything the API sends as a date and time
 * has to be read and entered in the account's zone, which this control has no
 * way to express, so it is not the one to reach for there.
 */
export function DateField<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string>,
  TTransformedValues = TFieldValues,
>({ control, name, label, description }: DateFieldProps<TFieldValues, TName, TTransformedValues>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <FieldShell label={label} description={description} messages={messagesFor(fieldState.error)}>
      {(binding) => (
        <Input
          {...binding}
          type="date"
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
