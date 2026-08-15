"use client";

import { useController, type FieldPathByValue, type FieldValues } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";

import type { FormControl } from "./control";
import { FieldShell } from "./field-shell";
import { messagesFor } from "./messages";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string | null>,
  TTransformedValues = TFieldValues,
> {
  control: FormControl<TFieldValues, TTransformedValues>;
  name: TName;
  label: string;
  description?: string;
  options: readonly SelectOption[];
  /** What an unanswered field reads as, both in the list and on the trigger. */
  noneLabel?: string;
}

/**
 * One choice from a fixed set, or none.
 *
 * "Not set" is an item in the list with a value of `null`, and that is the
 * point rather than a detail: not recording a work mode is a real answer, the
 * API stores it as an absent value, and an empty string in its place would send
 * something that has to be guessed at on the way back. So the form state holds
 * `null` and nothing here invents a sentinel for it.
 *
 * The options arrive as a prop. The unions live in one place and the labels are
 * the screen's to write - "Hiring manager" is not what the contract calls it.
 */
export function SelectField<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string | null>,
  TTransformedValues = TFieldValues,
>({
  control,
  name,
  label,
  description,
  options,
  noneLabel = "Not set",
}: SelectFieldProps<TFieldValues, TName, TTransformedValues>) {
  const { field, fieldState } = useController({ control, name });

  // Given to the root as well as rendered, which is what lets the trigger show
  // a label rather than the raw contract value it is keyed by.
  const items = [{ value: null, label: noneLabel }, ...options];

  return (
    <FieldShell label={label} description={description} messages={messagesFor(fieldState.error)}>
      {(binding) => (
        <Select
          items={items}
          value={field.value}
          onValueChange={field.onChange}
          name={field.name}
          disabled={field.disabled}
        >
          <SelectTrigger {...binding} className="w-full" onBlur={field.onBlur} ref={field.ref}>
            <SelectValue />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value={null}>{noneLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldShell>
  );
}
