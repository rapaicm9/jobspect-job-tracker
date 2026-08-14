import { describe, expect, it } from "vitest";

import { ENTITLEMENTS } from "@/server/api/enums";
import { grants } from "@/server/dal";

// `getPlan` and `hasEntitlement` are not here, and not missing: both reach
// `verifySession`, which reads `cookies()`, so they need a request scope Vitest
// cannot give them. They are exercised end to end, the way `getAccount` is.

describe("grants", () => {
  // Driven off the union rather than listing five names, so a sixth entitlement
  // added without a decision about what unlocks it fails here.
  it.each(ENTITLEMENTS)("unlocks %s for Pro", (entitlement) => {
    expect(grants("Pro", entitlement)).toBe(true);
  });

  it.each(ENTITLEMENTS)("withholds %s from Free", (entitlement) => {
    expect(grants("Free", entitlement)).toBe(false);
  });

  it.each(ENTITLEMENTS)("withholds %s from a tier it does not recognise", (entitlement) => {
    // The half of this that is not obvious from reading `grants`. A tier this
    // build has never heard of reads as Free, which for a full-replace write
    // means sending nothing for the gated field - the answer that retains what
    // is stored wherever the server refuses the write.
    expect(grants(null, entitlement)).toBe(false);
  });
});
