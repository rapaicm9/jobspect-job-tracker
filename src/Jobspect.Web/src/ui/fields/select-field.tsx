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
  /**
   * Makes the field a required choice: no "Not set" to pick, and this shown on
   * the trigger until something is.
   *
   * A required field that offers an empty option and then refuses it wastes a
   * submit to say what the list could have said by not being there. Insisting on
   * an answer is still the schema's job - the form state holds `null` until one
   * is given either way.
   */
  placeholder?: string;
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
  placeholder,
}: SelectFieldProps<TFieldValues, TName, TTransformedValues>) {
  const { field, fieldState } = useController({ control, name });
  const required = placeholder !== undefined;

  // Given to the root as well as rendered, which is what lets the trigger show
  // a label rather than the raw contract value it is keyed by. A null item's
  // label here would override the placeholder, so a required field states none.
  const items = required ? options : [{ value: null, label: noneLabel }, ...options];

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
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>

          <SelectContent>
            {!required && <SelectItem value={null}>{noneLabel}</SelectItem>}
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
