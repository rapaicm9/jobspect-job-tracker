import { describe, expect, it } from "vitest";

import { classify } from "@/server/api/errors";
import { toFormState } from "@/features/auth/form-state";

const PASSWORD_RULES = [
  "The password must be at least 8 characters long.",
  "The password must contain an uppercase letter.",
  "The password must contain a lowercase letter.",
  "The password must contain a digit.",
];

describe("a rejected password", () => {
  it("keeps every rule the API listed", () => {
    // The rule this file exists to hold. The API answers with all four at once;
    // joining them into a sentence, or showing the first, turns one correction
    // into four round trips.
    const state = toFormState(classify(422, { status: 422, errors: { password: PASSWORD_RULES } }));

    expect(state.fieldErrors.password).toEqual(PASSWORD_RULES);
    expect(state.formError).toBeNull();
  });
});

describe("wrong credentials", () => {
  it("are reported above the form, never on a field", () => {
    const state = toFormState(
      classify(401, { status: 401, code: "auth.invalid_credentials", detail: "…" }),
    );

    // The API refuses to say which half was wrong so nobody can discover which
    // addresses have accounts. Attaching the message to `email` or `password`
    // would give that away on this side instead.
    expect(state.fieldErrors).toEqual({});
    expect(state.formError).toBe("The email or password is incorrect.");
  });
});

describe("an email that is already registered", () => {
  it("is attached to the email field", () => {
    const state = toFormState(classify(409, { status: 409, code: "registration.email_taken" }));

    expect(state.fieldErrors.email).toHaveLength(1);
    expect(state.formError).toBeNull();
  });
});

describe("a failure the user cannot act on", () => {
  it.each([
    ["a server fault", classify(500, { status: 500 })],
    ["an unknown code", classify(418, { status: 418, code: "something.new" })],
  ])("%s stays off the fields", (_name, failure) => {
    // A 500 beside the password box invites the user to change a password that
    // was never the problem.
    const state = toFormState(failure);

    expect(state.fieldErrors).toEqual({});
    expect(state.formError).not.toBeNull();
  });

  it("a rate limit names the wait when the API gives one", () => {
    const state = toFormState(classify(429, { status: 429 }, new Headers({ "retry-after": "30" })));

    expect(state.formError).toContain("30");
  });

  it("a rate limit stays vague when it does not", () => {
    const state = toFormState(classify(429, { status: 429 }));

    expect(state.formError).toBeTruthy();
    expect(state.formError).not.toContain("null");
  });

  it("an unreachable API reads as transient", () => {
    const state = toFormState({ kind: "network", cause: new Error("ECONNREFUSED") });

    expect(state.formError).toContain("try again");
  });
});
