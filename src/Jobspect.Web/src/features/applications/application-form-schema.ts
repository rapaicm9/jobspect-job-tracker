import { z } from "zod";

import { WORK_MODES } from "@/lib/enums";
import {
  EMPTY_MONEY,
  optionalDate,
  optionalMoney,
  optionalText,
  requiredDate,
  requiredText,
} from "@/lib/form-schema";

import type { ApplicationDetail } from "./application-detail";

/**
 * What the edit form validates, and only that.
 *
 * The rules here are shape - was an answer given, what type is it, and the one
 * cross-field rule the API reports as a single error. Lengths, the absolute-URL
 * check and the three-letter currency shape stay on the server, which answers
 * each with a message keyed to its field.
 *
 * Three of the request's properties are deliberately absent. `campaignId`, the
 * company id and the custom-field bag are carried beside the form rather than
 * edited in it, because a full replace has to send all three and none of them is
 * something the user types.
 *
 * Free of `server-only`, like the mappers beside it: a schema over a shape is
 * testable without a request.
 */
export const applicationFormSchema = z.object({
  role: requiredText("A role is required."),
  // The name only. Whether it resolves to the company already on this
  // application or to a new one is settled at submit, by whether it changed.
  companyName: optionalText(),
  source: optionalText(),
  location: optionalText(),
  postingUrl: optionalText(),
  cvLabel: optionalText(),
  coverLetterLabel: optionalText(),
  workMode: z.enum(WORK_MODES).nullable(),
  appliedDate: requiredDate("An applied date is required.", "Enter the applied date as a date."),
  applicationDeadline: optionalDate("Enter the application deadline as a date."),
  offerDecisionDeadline: optionalDate("Enter the offer decision deadline as a date."),
  compensation: optionalMoney({
    notANumber: "Enter the compensation as a number.",
    amountWithoutCurrency: "Add a currency code, for example EUR.",
    currencyWithoutAmount: "Add an amount, or clear the currency.",
  }),
});

export type ApplicationFormInput = z.input<typeof applicationFormSchema>;
export type ApplicationFormOutput = z.output<typeof applicationFormSchema>;

/**
 * The stored application, as the form holds it while it is being edited.
 *
 * Every absent value becomes `""` rather than staying null: an input is a string
 * for as long as somebody is typing in it, and the schema turns the blank back
 * into null on the way out. Skipping that and binding null straight to an input
 * is how a controlled field goes uncontrolled halfway through an edit.
 */
export function toFormValues(application: ApplicationDetail): ApplicationFormInput {
  return {
    role: application.role,
    companyName: application.companyName ?? "",
    source: application.source ?? "",
    location: application.location ?? "",
    postingUrl: application.postingUrl ?? "",
    cvLabel: application.cvLabel ?? "",
    coverLetterLabel: application.coverLetterLabel ?? "",
    workMode: application.workMode,
    appliedDate: application.appliedDate,
    applicationDeadline: application.applicationDeadline ?? "",
    offerDecisionDeadline: application.offerDecisionDeadline ?? "",
    compensation:
      application.compensation === null
        ? EMPTY_MONEY
        : {
            // The stored number as text, which is what the box holds. Not
            // formatted: a thousands separator typed back in is not a number,
            // and this value is about to be read by a parser rather than a
            // person.
            amount: String(application.compensation.amount),
            currency: application.compensation.currency,
          },
  };
}
