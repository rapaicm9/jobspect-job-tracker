import type { FieldPath, FieldValues, UseControllerProps } from "react-hook-form";

/**
 * The control a field binds to, taken from react-hook-form's own definition
 * rather than restated.
 *
 * Every form here transforms on the way out - a blank box becomes null, two
 * money boxes become one value - so `useForm` carries an output type distinct
 * from the values it holds, and the control it hands over carries it too. A
 * field declaring the plain `Control<TFieldValues>` refuses that control
 * outright, which is a compile error about variance rather than anything the
 * caller did wrong.
 *
 * Deriving the type keeps it correct without this file having to spell out the
 * `any` react-hook-form uses for its context slot.
 */
export type FormControl<TFieldValues extends FieldValues, TTransformedValues> = NonNullable<
  UseControllerProps<TFieldValues, FieldPath<TFieldValues>, TTransformedValues>["control"]
>;
