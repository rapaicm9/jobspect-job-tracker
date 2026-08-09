import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { api, callApi } from "@/server/api/client";

// Mock the HTTP boundary, never the Server Actions: an action is application
// code, and mocking it would test the mock. Everything below goes through the
// real client, the real middlewares and the real classifier.
const BASE = "http://api.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function respondToPlan(status: number, body: unknown, headers?: Record<string, string>) {
  server.use(
    http.get(`${BASE}/api/v1/billing/plan`, () =>
      body === null
        ? new HttpResponse(null, { status, headers })
        : HttpResponse.json(body, { status, headers }),
    ),
  );
}

const getPlan = () => callApi(() => api.GET("/api/v1/billing/plan"));

describe("a successful call", () => {
  it("comes back as data", async () => {
    respondToPlan(200, { tier: "Free", entitlements: [] });

    const result = await getPlan();

    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toEqual({ tier: "Free", entitlements: [] });
  });
});

describe("each documented problem shape maps to a behaviour", () => {
  it("bodyless 401 -> token-stale", async () => {
    // The most frequent failure the BFF will see, and the only 401 that
    // refreshing fixes. It has no body because it comes from the bearer
    // challenge rather than from the API's own problem writer.
    respondToPlan(401, null, { "www-authenticate": "Bearer" });

    const result = await getPlan();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("token-stale");
  });

  it("401 with a code -> session-destroyed", async () => {
    respondToPlan(401, { title: "Unauthorized", status: 401, code: "auth.invalid_token" });

    const result = await getPlan();

    expect(!result.ok && result.failure.kind).toBe("session-destroyed");
  });

  it("403 -> entitlement naming the capability", async () => {
    respondToPlan(403, {
      title: "Forbidden",
      status: 403,
      code: "account.export_not_entitled",
    });

    const result = await getPlan();

    expect(!result.ok && result.failure.kind).toBe("entitlement");
    expect(!result.ok && result.failure.kind === "entitlement" && result.failure.entitlement).toBe(
      "Export",
    );
  });

  it("404 -> not-found, never a permission message", async () => {
    respondToPlan(404, { title: "Not Found", status: 404, code: "billing.plan_not_found" });

    const result = await getPlan();

    expect(!result.ok && result.failure.kind).toBe("not-found");
  });

  it("422 with field errors -> validation carrying every message", async () => {
    respondToPlan(422, {
      title: "One or more validation errors occurred.",
      status: 422,
      errors: { password: ["At least 8 characters.", "One uppercase letter."] },
    });

    const result = await getPlan();

    expect(!result.ok && result.failure.kind).toBe("validation");
    expect(
      !result.ok && result.failure.kind === "validation" && result.failure.fieldErrors.password,
    ).toHaveLength(2);
  });

  it("503 -> unavailable with its Retry-After", async () => {
    respondToPlan(
      503,
      { title: "Service Unavailable", status: 503, code: "idempotency.unavailable" },
      { "retry-after": "5" },
    );

    const result = await getPlan();

    expect(!result.ok && result.failure.kind).toBe("unavailable");
    expect(
      !result.ok && result.failure.kind === "unavailable" && result.failure.retryAfterSeconds,
    ).toBe(5);
  });

  it("preserves traceId for logging without surfacing it", async () => {
    respondToPlan(404, {
      status: 404,
      code: "billing.plan_not_found",
      traceId: "00-abc-01",
    });

    const result = await getPlan();

    // Logged against the BFF's own span; never shown to a user.
    expect(
      !result.ok && result.failure.kind === "not-found" && result.failure.problem.traceId,
    ).toBe("00-abc-01");
  });
});

describe("a request that never completes", () => {
  it("arrives as a value rather than a throw", async () => {
    server.use(http.get(`${BASE}/api/v1/billing/plan`, () => HttpResponse.error()));

    const result = await getPlan();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("network");
  });
});
