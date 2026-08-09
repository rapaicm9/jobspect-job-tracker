import { describe, expect, it } from "vitest";

import { CODE_BEHAVIOUR, ERROR_CODES, classify, isErrorCode } from "@/server/api/errors";

const problem = (code: string, extra: Record<string, unknown> = {}) => ({
  type: "https://tools.ietf.org/html/rfc9457",
  title: "A problem",
  detail: "Something specific.",
  traceId: "00-2c02-01",
  code,
  ...extra,
});

describe("the catalogue", () => {
  it("has a behaviour for every code and no orphans", () => {
    expect(Object.keys(CODE_BEHAVIOUR).sort()).toEqual([...ERROR_CODES].sort());
  });

  it("holds no duplicates", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it("recognises only its own codes", () => {
    expect(isErrorCode("application.not_found")).toBe(true);
    expect(isErrorCode("application.invented_yesterday")).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });
});

// Four 401 shapes, and only one of them is fixed by refreshing. Getting this
// wrong means either a session that will not recover or a refresh loop against
// a backend that revokes the whole token family when a retired token reappears.
describe("the 401 family", () => {
  it("treats a bodyless 401 as a stale token", () => {
    expect(classify(401, null)).toEqual({ kind: "token-stale" });
  });

  it("treats a 401 with no code as a stale token", () => {
    expect(classify(401, { title: "Unauthorized", status: 401 })).toEqual({
      kind: "token-stale",
    });
  });

  it.each([
    ["auth.invalid_token", false],
    ["auth.user_not_found", false],
    ["refresh_token.expired", false],
    ["refresh_token.invalid", false],
    ["refresh_token.user_not_found", false],
    ["refresh_token.reuse_detected", true],
  ])("destroys the session on %s", (code, familyRevoked) => {
    const failure = classify(401, problem(code));

    expect(failure.kind).toBe("session-destroyed");
    if (failure.kind === "session-destroyed") {
      expect(failure.familyRevoked).toBe(familyRevoked);
    }
  });

  it("keeps bad credentials form-level", () => {
    // Never field-level: saying which half was wrong tells an attacker whether
    // the address is registered.
    expect(classify(401, problem("auth.invalid_credentials")).kind).toBe("credentials");
  });
});

// The transition endpoint answers 422 two ways on purpose. Status cannot tell
// them apart; which member is present can.
describe("the transition endpoint's two 422s", () => {
  it("reads a field-keyed body as validation", () => {
    const failure = classify(422, {
      title: "One or more validation errors occurred.",
      errors: { stage: ["'Nope' is not a stage."] },
    });

    expect(failure.kind).toBe("validation");
    if (failure.kind === "validation") {
      expect(failure.fieldErrors.stage).toHaveLength(1);
    }
  });

  it("reads a coded body as an illegal move", () => {
    const failure = classify(422, problem("application.illegal_transition"));

    expect(failure.kind).toBe("illegal-transition");
    // `detail` names both stages, so the server states the refusal better than
    // the client could guess at it.
    expect(failure.kind === "illegal-transition" && failure.problem.detail).toBeTruthy();
  });
});

describe("validation bodies", () => {
  it("keeps every message for a field, not just the first", () => {
    const failure = classify(422, {
      errors: { password: ["At least 8 characters.", "One uppercase letter."] },
    });

    expect(failure.kind === "validation" && failure.fieldErrors.password).toEqual([
      "At least 8 characters.",
      "One uppercase letter.",
    ]);
  });
});

describe("codes that carry a specific behaviour", () => {
  it("resets silently on a stale cursor", () => {
    expect(classify(422, problem("cursor.sort_mismatch")).kind).toBe("cursor-reset");
  });

  it("degrades one chart rather than the page", () => {
    expect(classify(503, problem("analytics.chart_unavailable")).kind).toBe("chart-unavailable");
  });

  it("names the capability behind an entitlement refusal", () => {
    const failure = classify(403, problem("custom_field.query_not_entitled"));

    expect(failure.kind).toBe("entitlement");
    expect(failure.kind === "entitlement" && failure.entitlement).toBe("CustomFields");
  });

  it("separates a plan cap from an entitlement", () => {
    // Both are 403-adjacent in the UI but they say different things: one is
    // "upgrade", the other is "you have used all of them".
    expect(classify(409, problem("campaign.limit_reached")).kind).toBe("limit-reached");
    expect(classify(403, problem("campaign.not_entitled")).kind).toBe("entitlement");
  });

  it("reads Retry-After off an in-flight idempotent write", () => {
    const failure = classify(
      409,
      problem("idempotency.in_flight"),
      new Headers({ "retry-after": "2" }),
    );

    expect(failure.kind).toBe("idempotency-in-flight");
    expect(failure.kind === "idempotency-in-flight" && failure.retryAfterSeconds).toBe(2);
  });

  it("calls a reused key our bug", () => {
    expect(classify(422, problem("idempotency.key_reused")).kind).toBe("client-bug");
  });

  it("surfaces a server fault as a fault, not as validation", () => {
    // These are Error.Failure on the backend, so there is no field to attach a
    // message to and nothing the user could fix by editing the form.
    for (const code of [
      "account.update_failed",
      "auth.logout_all_failed",
      "application.no_default_campaign",
    ]) {
      expect(classify(500, problem(code)).kind).toBe("server-fault");
    }
  });

  it("keeps a registration refusal at form level", () => {
    expect(classify(422, problem("registration.invalid")).kind).toBe("form-error");
  });

  it("attaches a bad reference to the field that carried it", () => {
    const failure = classify(422, problem("application.unknown_campaign"));

    expect(failure.kind).toBe("field-error");
    expect(failure.kind === "field-error" && failure.field).toBe("campaignId");
  });
});

describe("a 404 is absence, never permission", () => {
  it.each(ERROR_CODES.filter((code) => code.endsWith(".not_found")))("%s", (code) => {
    expect(classify(404, problem(code)).kind).toBe("not-found");
  });
});

describe("codes this build has never seen", () => {
  it("falls back to the status family rather than guessing", () => {
    expect(classify(404, problem("something.invented")).kind).toBe("not-found");
    expect(classify(500, problem("something.invented")).kind).toBe("server-fault");
    expect(classify(503, problem("something.invented")).kind).toBe("unavailable");
  });

  it("reports an unmappable status as unknown rather than inventing a behaviour", () => {
    const failure = classify(418, problem("something.invented"));

    expect(failure.kind).toBe("unknown");
    expect(failure.kind === "unknown" && failure.status).toBe(418);
  });

  it("reads Retry-After on a rate limit", () => {
    const failure = classify(
      429,
      { title: "Too Many Requests" },
      new Headers({ "retry-after": "30" }),
    );

    expect(failure.kind).toBe("rate-limited");
    expect(failure.kind === "rate-limited" && failure.retryAfterSeconds).toBe(30);
  });
});
