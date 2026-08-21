import { describe, expect, it } from "vitest";

import { toResult } from "@/server/api/client";

/**
 * The join between `openapi-fetch` and the union features branch on.
 *
 * One case here is worth its own file: a 204. `data` is `undefined` both when a
 * response carried nothing and when a body failed to arrive, and only the status
 * separates them. Read as the second, a delete that worked reports a failure
 * nobody can explain - which is exactly what the first bodyless endpoint this
 * client consumed did.
 */

const ok = (status: number, body?: unknown) => ({
  data: body as never,
  response: new Response(null, { status }),
});

describe("a successful response", () => {
  it("carries its body through", () => {
    expect(toResult(ok(200, { role: "Engineer" }))).toEqual({
      ok: true,
      data: { role: "Engineer" },
    });
  });

  it("treats a 204 as success even though it carries nothing", () => {
    expect(toResult(ok(204))).toEqual({ ok: true, data: undefined });
  });

  it("treats a 200 with no body as a failure, which is what it is", () => {
    // Not the same thing as a 204. Nothing on this API answers 200 with an empty
    // body, so an absent one means the response did not survive parsing.
    const result = toResult(ok(200));

    expect(result.ok).toBe(false);
  });
});

describe("a failed response", () => {
  it("classifies by the problem body it carried", () => {
    const result = toResult({
      error: { status: 404, code: "application.not_found" },
      response: new Response(null, { status: 404 }),
    });

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: "not-found",
        code: "application.not_found",
        problem: { status: 404, code: "application.not_found" },
      },
    });
  });

  it("falls back to the status when there is no body at all", () => {
    const result = toResult({ response: new Response(null, { status: 503 }) });

    expect(result).toMatchObject({ ok: false, failure: { kind: "unavailable" } });
  });
});
