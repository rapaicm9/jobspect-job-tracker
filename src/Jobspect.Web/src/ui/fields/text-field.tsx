"use client";

import { useController, type FieldPathByValue, type FieldValues } from "react-hook-form";

import { Input } from "@/ui/input";

import type { FormControl } from "./control";
import { FieldShell } from "./field-shell";
import { messagesFor } from "./messages";

export interface TextFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string>,
  TTransformedValues = TFieldValues,
> {
  control: FormControl<TFieldValues, TTransformedValues>;
  name: TName;
  label: string;
  description?: string;
  placeholder?: string;
  autoComplete?: string;
  /** `url` and `email` only for the keyboard and the autofill hint. */
  type?: "text" | "url" | "email" | "tel";
  /**
   * `decimal` for anything numeric, rather than `type="number"`: a number input
   * fights a decimal comma, changes value on a stray scroll wheel, and hands
   * over a string regardless - which is why the schema coerces either way.
   */
  inputMode?: "text" | "decimal" | "numeric";
}

/**
 * A single line of text.
 *
 * Bound to a `string` path rather than to any path, so the form state cannot
 * hold a null here and the input cannot silently go uncontrolled. A field the
 * user may leave alone is still a string while it is being typed; turning the
 * blank into `null` is the schema's job at submit.
 */
export function TextField<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, string>,
  TTransformedValues = TFieldValues,
>({
  control,
  name,
  label,
  description,
  placeholder,
  autoComplete,
  type = "text",
  inputMode,
}: TextFieldProps<TFieldValues, TName, TTransformedValues>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <FieldShell label={label} description={description} messages={messagesFor(fieldState.error)}>
      {(binding) => (
        <Input
          {...binding}
          type={type}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete={autoComplete}
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
