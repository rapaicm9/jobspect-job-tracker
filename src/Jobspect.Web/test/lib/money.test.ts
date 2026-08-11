import { describe, expect, it } from "vitest";

import { formatMoney } from "@/lib/money";

describe("formatMoney", () => {
  it("renders a known currency in its own symbol", () => {
    expect(formatMoney({ amount: 65000, currency: "GBP" })).toBe("£65,000");
    // "US$" rather than "$", because the locale is British and a bare dollar
    // sign would be ambiguous to the reader it is rendered for.
    expect(formatMoney({ amount: 120000, currency: "USD" })).toBe("US$120,000");
  });

  it("drops the pence on a whole figure and keeps them otherwise", () => {
    // A salary column of ".00" is noise, and a figure that does carry pence is
    // not one to round away.
    expect(formatMoney({ amount: 65000, currency: "EUR" })).toBe("€65,000");
    expect(formatMoney({ amount: 1234.5, currency: "EUR" })).toBe("€1,234.50");
  });

  it("renders a currency it has no symbol for as the code itself", () => {
    // The API stores any three-letter code verbatim and keeps no registry, so
    // this is an ordinary row rather than an error. Intl already handles it.
    //
    // The separator is U+00A0, not a space: Intl will not let a currency code be
    // split from its amount across a line break. Written as an escape because
    // the two are indistinguishable on screen and a plain space here would fail
    // with the expected and received values looking identical.
    expect(formatMoney({ amount: 1000, currency: "XYZ" })).toBe("XYZ 1,000");
  });

  it("falls back rather than throwing on a code that is not three letters", () => {
    // What Intl actually refuses. The API cannot send this - it validates the
    // shape - so the guard is about this function's contract, not the API's.
    expect(formatMoney({ amount: 1000, currency: "12" })).toBe("1,000 12");
    expect(formatMoney({ amount: 1000, currency: "" })).toBe("1,000 ");
  });

  it("answers null for money the API did not send", () => {
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney(undefined)).toBeNull();
  });
});
