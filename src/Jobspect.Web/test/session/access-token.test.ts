import { describe, expect, it } from "vitest";

import { accessTokenFor, UpstreamError, type SessionState } from "@/server/dal";

// The rule this file exists for: a session store that could not be read must not
// turn into a call made with no credential. That failure is invisible from the
// outside - the API answers a bodyless 401 and the client reports a stale token -
// so nothing downstream can tell it from an expired session.

const active: SessionState = {
  status: "active",
  session: { sid: "sid", userId: "user", accessToken: "token" },
};

describe("the credential a call should carry", () => {
  it("is the session's token while there is one", () => {
    expect(accessTokenFor(active)).toBe("token");
  });

  it.each([["anonymous"], ["expired"], ["revoked"]] as const)(
    "is nothing when there is genuinely no session (%s)",
    (status) => {
      // Not an error. A call with no session is anonymous, and the API is
      // entitled to say what it thinks of that.
      expect(accessTokenFor({ status })).toBeNull();
    },
  );

  it("refuses to answer at all when the store could not be read", () => {
    // Surfaced rather than swallowed, so the reader gets an error boundary at the
    // point of failure instead of a screen that quietly lost its data.
    expect(() => accessTokenFor({ status: "unavailable" })).toThrow(UpstreamError);
  });
});
