import { z } from "zod";

import type { Money } from "./money";

/**
 * The pieces every form on this client builds its request schema from.
 *
 * They exist because a form input answers in strings and the API answers in
 * types, and the gap between the two is where a blank box quietly becomes a
 * value. Each helper takes what an `<input>` actually hands over and produces
 * what the request carries.
 *
 * What they deliberately do not do is restate the API's rules. Lengths,
 * absolute-URL checks and the three-letter currency shape all live on the
 * server, which answers a breach with a message keyed to the field - the better
 * thing to show, and the only place the rule is written once. What is here is
 * shape: whether an answer was given at all, what type it is, and the
 * cross-field rules the API reports as a single error.
 */

/**
 * A blank box is an unanswered question, never an empty string.
 *
 * The distinction reaches the wire: the API's company rule refuses an id and a
 * name together, and `""` is a name as far as any check for presence is
 * concerned.
 */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Text that may be left alone. Whitespace only counts as left alone. */
export function optionalText() {
  return z.string().transform(blankToNull);
}

/** Text the form itself insists on, before the request is worth making. */
export function requiredText(message: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, message));
}

/**
 * A number that may be left alone - and the reason this file exists.
 *
 * `z.coerce.number()` on its own reads `""`, `" "` and `null` as **zero**,
 * because that is what `Number()` does with all three. Applied straight to a
 * form field it writes a salary of zero for somebody who recorded no salary,
 * and zero is a real answer here: an unpaid internship is a legitimate figure,
 * so nothing downstream can tell the two apart afterwards.
 *
 * So the blank is taken out first and the coercion runs on what is left.
 * `nullable()` short-circuits on null rather than coercing it, which is what
 * makes the order load-bearing rather than cosmetic.
 */
export function optionalNumber(message: string) {
  return z.string().transform(blankToNull).pipe(z.coerce.number<string>(message).nullable());
}

/**
 * A calendar date, which is what `<input type="date">` produces: `yyyy-mm-dd`
 * or the empty string, and never an instant. That is exactly the API's `date`
 * format, so it travels as written.
 */
export function optionalDate(message: string) {
  return z.string().transform(blankToNull).pipe(z.iso.date(message).nullable());
}

/**
 * A calendar date the form insists on.
 *
 * Two messages rather than one, because `z.iso.date()` answers a blank box and a
 * malformed date with the same sentence - and "Invalid ISO date" is not what to
 * tell somebody who simply has not filled the field in yet.
 */
export function requiredDate(missing: string, invalid: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value !== "", { message: missing })
    .pipe(z.iso.date(invalid));
}

/**
 * A date and time the form insists on, as `<input type="datetime-local">`
 * produces it: `yyyy-mm-ddThh:mm`, with seconds on the browsers that add them.
 *
 * A wall clock and not an instant - it names no zone, and turning it into one is
 * `fromZonedInput`'s job at submit, using the account's zone rather than the
 * browser's. Zod validates the calendar as well as the shape, so the 31st of
 * April never reaches that conversion.
 *
 * Two messages for `requiredDate`'s reason: a blank box and a malformed value are
 * different things to be told.
 */
export function requiredDateTime(missing: string, invalid: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value !== "", { message: missing })
    .pipe(z.iso.datetime({ local: true, error: invalid }));
}

/**
 * One of a fixed set, which the form insists on.
 *
 * Held as `null` until it is answered, so the control starts on its placeholder
 * rather than on whichever member happens to be first - a default here is a value
 * nobody chose, recorded as though they had. The output is narrowed, so a caller
 * cannot forget that the null was ruled out.
 */
export function requiredChoice<const T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) {
  return z
    .enum(values)
    .nullable()
    .refine((value): value is T[number] => value !== null, message);
}

/** What the two money inputs hold between them while they are being typed. */
export interface MoneyInput {
  amount: string;
  currency: string;
}

export const EMPTY_MONEY: MoneyInput = { amount: "", currency: "" };

export interface MoneyMessages {
  notANumber: string;
  amountWithoutCurrency: string;
  currencyWithoutAmount: string;
}

/**
 * Two inputs, one value, one error.
 *
 * The API has no field for an amount and no field for a currency - it has
 * `compensation`, and it keys every complaint about either half to that one
 * name. So this reports at the composite too, and the form renders one message
 * list under both boxes rather than blaming a box that may be perfectly fine.
 *
 * Half-filled is refused rather than dropped. An amount with no currency cannot
 * be sent, since the API requires both, and sending nothing instead would throw
 * away a figure the user typed without telling them.
 */
export function optionalMoney(messages: MoneyMessages) {
  return z
    .object({ amount: z.string(), currency: z.string() })
    .transform(({ amount, currency }) => ({
      amount: amount.trim(),
      currency: currency.trim(),
    }))
    .superRefine(({ amount, currency }, ctx) => {
      if (amount !== "" && !Number.isFinite(Number(amount))) {
        ctx.addIssue({ code: "custom", message: messages.notANumber });
        return;
      }

      if (amount !== "" && currency === "") {
        ctx.addIssue({ code: "custom", message: messages.amountWithoutCurrency });
      }

      if (amount === "" && currency !== "") {
        ctx.addIssue({ code: "custom", message: messages.currencyWithoutAmount });
      }
    })
    .transform(({ amount, currency }): Money | null =>
      amount === "" ? null : { amount: Number(amount), currency: currency.toUpperCase() },
    );
}
