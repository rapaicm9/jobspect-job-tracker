"use client";

import { useController, type FieldPathByValue, type FieldValues } from "react-hook-form";

import type { MoneyInput } from "@/lib/form-schema";
import { Field, FieldLabel } from "@/ui/field";
import { Input } from "@/ui/input";

import type { FormControl } from "./control";
import { FieldSetShell } from "./field-shell";
import { messagesFor } from "./messages";

export interface MoneyFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, MoneyInput>,
  TTransformedValues = TFieldValues,
> {
  control: FormControl<TFieldValues, TTransformedValues>;
  name: TName;
  legend: string;
  description?: string;
  amountLabel?: string;
  currencyLabel?: string;
}

/**
 * Two boxes holding one value, and reporting one problem.
 *
 * The API has no field for an amount and no field for a currency - it has
 * `compensation`, and it keys every complaint about either half to that name.
 * Splitting the message in two here would put a sentence about the pair under
 * whichever box the form guessed at, so both are described by one list under
 * the group.
 *
 * A fieldset rather than two loose fields, because that is what makes the
 * legend the thing a screen reader announces before either box.
 */
export function MoneyField<
  TFieldValues extends FieldValues,
  TName extends FieldPathByValue<TFieldValues, MoneyInput>,
  TTransformedValues = TFieldValues,
>({
  control,
  name,
  legend,
  description,
  amountLabel = "Amount",
  currencyLabel = "Currency",
}: MoneyFieldProps<TFieldValues, TName, TTransformedValues>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <FieldSetShell
      legend={legend}
      description={description}
      messages={messagesFor(fieldState.error)}
    >
      {({ id, ...described }) => {
        const value: MoneyInput = field.value;
        const update = (patch: Partial<MoneyInput>) => {
          field.onChange({ ...value, ...patch });
        };

        return (
          <div className="flex items-start gap-3">
            <Field className="flex-1">
              <FieldLabel htmlFor={`${id}-amount`}>{amountLabel}</FieldLabel>
              <Input
                {...described}
                id={`${id}-amount`}
                // Not `type="number"`: it fights a decimal comma, changes value
                // on a stray scroll wheel, and hands over a string either way -
                // which is why the schema coerces rather than trusting the
                // control.
                inputMode="decimal"
                name={`${field.name}.amount`}
                value={value.amount}
                onChange={(event) => {
                  update({ amount: event.target.value });
                }}
                onBlur={field.onBlur}
                // On the amount alone: a field can only be focused in one place,
                // and the amount is the half a refusal is usually about.
                ref={field.ref}
                disabled={field.disabled}
              />
            </Field>

            <Field className="w-24">
              <FieldLabel htmlFor={`${id}-currency`}>{currencyLabel}</FieldLabel>
              <Input
                {...described}
                id={`${id}-currency`}
                // Uppercased for the eye only. The schema does it for real,
                // matching what the API stores, so the value that comes back
                // agrees with the one that went out.
                className="uppercase"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="EUR"
                name={`${field.name}.currency`}
                value={value.currency}
                onChange={(event) => {
                  update({ currency: event.target.value });
                }}
                onBlur={field.onBlur}
                disabled={field.disabled}
              />
            </Field>
          </div>
        );
      }}
    </FieldSetShell>
  );
}
