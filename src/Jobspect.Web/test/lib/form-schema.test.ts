import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  EMPTY_MONEY,
  optionalDate,
  optionalMoney,
  optionalNumber,
  optionalText,
  requiredText,
} from "@/lib/form-schema";

const MONEY_MESSAGES = {
  notANumber: "Enter the compensation as a number.",
  amountWithoutCurrency: "Add a currency code, for example EUR.",
  currencyWithoutAmount: "Add an amount, or clear the currency.",
};

describe("a number box nobody filled in", () => {
  const schema = optionalNumber("Enter a number.");

  // The reason this helper exists. `z.coerce.number()` reads all three of these
  // as zero, which writes a salary of nothing for somebody who recorded nothing.
  it.each([[""], ["   "], ["\t"]])("is null rather than zero (%j)", (input) => {
    expect(schema.parse(input)).toBeNull();
  });

  it("still lets a real zero through", () => {
    // An unpaid internship is a legitimate figure, which is exactly why the
    // blank case cannot be allowed to look like it.
    expect(schema.parse("0")).toBe(0);
  });

  it("coerces the string a number input hands over", () => {
    expect(schema.parse("75000")).toBe(75000);
    expect(schema.parse(" 1234.5 ")).toBe(1234.5);
  });

  it.each([["abc"], ["12 000"], ["Infinity"]])("refuses what is not a number (%j)", (input) => {
    const result = schema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a number.");
  });
});

describe("a text box nobody filled in", () => {
  const schema = optionalText();

  it.each([[""], ["   "]])("is null rather than an empty string (%j)", (input) => {
    // Not tidiness. The API refuses a company id and a company name together,
    // and "" is a name to every check for presence.
    expect(schema.parse(input)).toBeNull();
  });

  it("trims what is there", () => {
    expect(schema.parse("  Acme  ")).toBe("Acme");
  });
});

describe("text the form insists on", () => {
  const schema = requiredText("A role is required.");

  it.each([[""], ["   "]])("refuses blank (%j)", (input) => {
    const result = schema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("A role is required.");
  });

  it("trims before it accepts", () => {
    expect(schema.parse("  Frontend Engineer  ")).toBe("Frontend Engineer");
  });
});

describe("a date box", () => {
  const schema = optionalDate("Enter a date.");

  it("is null when empty", () => {
    expect(schema.parse("")).toBeNull();
  });

  it("passes a calendar date through as written", () => {
    // What `<input type="date">` produces and what the API's date format is, so
    // there is no zone to place it in and nothing to convert.
    expect(schema.parse("2026-08-15")).toBe("2026-08-15");
  });

  it("refuses anything that is not one", () => {
    expect(schema.safeParse("15/08/2026").success).toBe(false);
  });
});

describe("two money boxes", () => {
  const schema = optionalMoney(MONEY_MESSAGES);

  it("is no compensation when both are empty", () => {
    expect(schema.parse(EMPTY_MONEY)).toBeNull();
  });

  it("uppercases the currency the way the API stores it", () => {
    // Echoing "eur" back would look right on this one response and disagree
    // with every read afterwards.
    expect(schema.parse({ amount: "75000", currency: "eur" })).toEqual({
      amount: 75000,
      currency: "EUR",
    });
  });

  it("keeps a genuine zero", () => {
    expect(schema.parse({ amount: "0", currency: "EUR" })).toEqual({
      amount: 0,
      currency: "EUR",
    });
  });

  it.each([
    [{ amount: "75000", currency: "" }, MONEY_MESSAGES.amountWithoutCurrency],
    [{ amount: "", currency: "EUR" }, MONEY_MESSAGES.currencyWithoutAmount],
    [{ amount: "lots", currency: "EUR" }, MONEY_MESSAGES.notANumber],
  ])("refuses a half-filled pair rather than dropping it (%j)", (input, message) => {
    const result = schema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it("keys its complaint to the composite, not to one of the boxes", () => {
    // The API has no field for an amount and no field for a currency. It has
    // `compensation`, and every complaint about either half arrives under that
    // name - so the form has one place to render the message.
    const form = z.object({ compensation: schema });

    const result = form.safeParse({ compensation: { amount: "75000", currency: "" } });

    expect(result.error?.issues[0]?.path).toEqual(["compensation"]);
  });
});
