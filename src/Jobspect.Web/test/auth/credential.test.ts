import { describe, expect, it } from "vitest";

import { parsePasswordCredential } from "@/features/auth/credential";

function form(entries: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.append(name, value);
  return data;
}

describe("a complete submission", () => {
  it("becomes a password credential", () => {
    const parsed = parsePasswordCredential(
      form({ email: "someone@example.com", password: "Sup3rSecret!" }),
    );

    expect(parsed).toEqual({
      ok: true,
      credential: { kind: "password", email: "someone@example.com", password: "Sup3rSecret!" },
    });
  });

  it("trims the email but never the password", () => {
    const parsed = parsePasswordCredential(
      form({ email: "  someone@example.com  ", password: "  spaces  " }),
    );

    expect(parsed.ok && parsed.credential.email).toBe("someone@example.com");
    // Leading and trailing spaces are part of a password. Trimming one here
    // would lock out an account that registered with it.
    expect(parsed.ok && parsed.credential.password).toBe("  spaces  ");
  });
});

describe("a submission with something missing", () => {
  it("keys its messages the way the form renders them", () => {
    const parsed = parsePasswordCredential(form({ email: "  ", password: "" }));

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.fieldErrors).toEqual({
      email: ["An email address is required."],
      password: ["A password is required."],
    });
  });

  it("rejects a field that is not a string at all", () => {
    // A multipart body can carry a File under any name, and `String(file)`
    // would satisfy a looser check while sending nonsense to the API.
    const parsed = parsePasswordCredential(
      form({ email: new File(["x"], "e.txt"), password: "Sup3rSecret!" }),
    );

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && Object.keys(parsed.fieldErrors)).toEqual(["email"]);
  });
});

describe("the password policy", () => {
  it("is left to the API", () => {
    // Duplicating the rules here would mean two places to change and a client
    // that can disagree with the server about what is valid. The API answers a
    // weak password with every unmet rule at once, which is better than this
    // guessing at the first.
    const parsed = parsePasswordCredential(form({ email: "a@b.co", password: "x" }));

    expect(parsed.ok).toBe(true);
  });
});
