import { describe, expect, it } from "vitest";

import {
  createApplicationFormSchema,
  emptyFormValues,
  type CreateApplicationFormInput,
} from "@/features/applications/application-form-schema";
import {
  toCreateRequest,
  type CreateApplicationBody,
} from "@/features/applications/to-create-request";

const FILLED: CreateApplicationFormInput = {
  role: "Frontend Engineer",
  companyName: "Acme",
  source: "Referral",
  location: "Berlin",
  postingUrl: "https://jobs.example.com/123",
  cvLabel: "cv-v4",
  coverLetterLabel: "letter-acme",
  workMode: "Hybrid",
  appliedDate: "2026-07-01",
  applicationDeadline: "2026-08-20",
  compensation: { amount: "75000", currency: "eur" },
};

function submit(
  values: CreateApplicationFormInput,
  campaignId: string | null = null,
): CreateApplicationBody {
  return toCreateRequest(createApplicationFormSchema.parse(values), campaignId);
}

/** Written by hand, for the reason the replace suite's expectation is. */
const EXPECTED: CreateApplicationBody = {
  role: "Frontend Engineer",
  campaignId: null,
  companyId: null,
  companyName: "Acme",
  compensation: { amount: 75000, currency: "EUR" },
  location: "Berlin",
  workMode: "Hybrid",
  postingUrl: "https://jobs.example.com/123",
  source: "Referral",
  appliedDate: "2026-07-01",
  applicationDeadline: "2026-08-20",
  cvLabel: "cv-v4",
  coverLetterLabel: "letter-acme",
  customFields: null,
};

describe("a filled-in form", () => {
  it("sends every value it was given", () => {
    // Also the guard on the body's shape: a property the endpoint grows fails
    // here until somebody decides what it is worth.
    expect(submit(FILLED)).toEqual(EXPECTED);
  });

  it("has no offer decision deadline to send", () => {
    // Not an omission. A new application is at Applied, and the endpoint has no
    // such property - a decision deadline with no offer behind it means nothing.
    expect("offerDecisionDeadline" in submit(FILLED)).toBe(false);
  });
});

describe("the least anybody can type", () => {
  // A role and nothing else, which is the whole of what the endpoint requires.
  const body = submit({ ...emptyFormValues(), role: "Frontend Engineer" });

  it("sends the role and leaves every other field absent", () => {
    expect(body).toEqual({
      role: "Frontend Engineer",
      campaignId: null,
      companyId: null,
      companyName: null,
      compensation: null,
      location: null,
      workMode: null,
      postingUrl: null,
      source: null,
      appliedDate: null,
      applicationDeadline: null,
      cvLabel: null,
      coverLetterLabel: null,
      customFields: null,
    });
  });

  it("leaves the applied date absent rather than guessing at today", () => {
    // The API fills it with today in the account's own timezone. Computing it
    // here would state the same rule a second time, and get it wrong for anybody
    // whose browser disagrees with their account.
    expect(body.appliedDate).toBeNull();
  });
});

describe("the company", () => {
  it("always travels as a name, never as an id", () => {
    // There is no stored application to have an id from, so the XOR that the
    // replace has to decide has one branch here.
    expect(submit({ ...FILLED, companyName: "Globex" })).toMatchObject({
      companyId: null,
      companyName: "Globex",
    });
  });

  it("is absent when nothing was typed", () => {
    expect(submit({ ...FILLED, companyName: "  " })).toMatchObject({
      companyId: null,
      companyName: null,
    });
  });
});

describe("the campaign", () => {
  it("is the scope the form was opened from", () => {
    expect(submit(FILLED, "campaign-7").campaignId).toBe("campaign-7");
  });

  it("is absent when there is no scope, which is what selects the default", () => {
    // Absent means the account's default campaign - the API's rule. Naming one
    // here would be this client deciding what "no campaign" means.
    expect(submit(FILLED, null).campaignId).toBeNull();
  });
});

describe("the custom-field bag", () => {
  it("is null whatever the account's tier", () => {
    // A new application has no answers to retain or to clear, so the asymmetry
    // that makes the replace read a plan first cannot arise. Null is the one
    // value both tiers accept.
    expect(submit(FILLED).customFields).toBeNull();
  });
});
