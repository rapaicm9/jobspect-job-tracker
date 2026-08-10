/**
 * @vitest-environment jsdom
 *
 * Per-file rather than configured: Vitest 4 removed `environmentMatchGlobs`, and
 * everything else in this suite exercises server modules under Node.
 *
 * **Queries are async here, and have to be.** Testing Library wraps its mount in
 * `act`, which only flushes synchronously when React has been told it is under
 * test - and nothing sets that flag for us. The mount lands a macrotask later,
 * so `getBy*` sees an empty container and `findBy*` sees the real thing. Setting
 * the flag by hand makes React warn on every state update instead, which buys
 * noise rather than coverage.
 *
 * **`CredentialForm` is not here.** Its inputs and button come from Base UI,
 * which reads a null React dispatcher under Vitest: Vite hands it React through
 * a CommonJS interop proxy while the renderer holds the ES module instance, and
 * neither `resolve.dedupe` nor inlining the package reconciles them. The two
 * components below own the rules worth asserting, and the form's own wiring -
 * label association and a valid `aria-describedby` - is what axe checks on
 * /login and /register in the Playwright run.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FieldErrors } from "@/features/auth/components/field-errors";
import { SessionEndedNotice } from "@/features/auth/components/session-ended-notice";

// Explicit because Testing Library only registers its own cleanup when Vitest
// runs with globals, which this project does not. Without it each render stacks
// on the last and a query finds the previous test's markup.
afterEach(cleanup);

const PASSWORD_RULES = [
  "The password must be at least 8 characters long.",
  "The password must contain an uppercase letter.",
  "The password must contain a lowercase letter.",
  "The password must contain a digit.",
];

describe("a field the API refused several times over", () => {
  it("renders every message, not the first", async () => {
    render(<FieldErrors id="password-errors" messages={PASSWORD_RULES} />);

    // The rule this component exists to hold. One sentence, or the first of
    // four, turns a single correction into four round trips.
    expect(await screen.findAllByRole("listitem")).toHaveLength(PASSWORD_RULES.length);
  });

  it("carries the id the input points at", async () => {
    render(<FieldErrors id="password-errors" messages={PASSWORD_RULES} />);

    // Without this the messages are read as loose text near the field rather
    // than as part of it.
    expect((await screen.findByRole("list")).id).toBe("password-errors");
  });
});

describe("a field with nothing wrong", () => {
  it.each([[undefined], [[]]])("renders nothing at all (%s)", (messages) => {
    const { container } = render(<FieldErrors id="password-errors" messages={messages} />);

    // An empty list would still be an element for `aria-describedby` to point
    // at, and a screen reader would announce a list with no items.
    expect(container.innerHTML).toBe("");
  });
});

describe("the reason a session ended", () => {
  it("says plainly when the account was signed out everywhere", async () => {
    render(<SessionEndedNotice reason="revoked" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("signed out of every device");
  });

  it("stays calm about an ordinary expiry", async () => {
    render(<SessionEndedNotice reason="expired" />);

    const alert = await screen.findByRole("alert");
    // A routine expiry must not read like a security event, or the wording for
    // the one that is stops meaning anything.
    expect(alert.textContent).not.toContain("signed out of every device");
    expect(alert.textContent).toContain("sign in again");
  });
});
