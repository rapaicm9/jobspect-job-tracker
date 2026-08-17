/**
 * @vitest-environment jsdom
 *
 * Per-file rather than configured: Vitest 4 removed `environmentMatchGlobs`, and
 * everything else in this suite exercises server modules under Node.
 *
 * If every assertion here starts failing with `Invalid hook call`, the install
 * has two copies of React and the primitives are holding the one the renderer is
 * not. Compare what `node_modules/react` resolves to against the copy reached
 * from inside `@base-ui/react` - on Windows a symlink written with the wrong
 * directory casing resolves to a second module id for the same file - and
 * reinstall.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CredentialForm } from "@/features/auth/components/credential-form";
import { SessionEndedNotice } from "@/features/auth/components/session-ended-notice";
import { EMPTY_FORM_STATE, type AuthFormState } from "@/features/auth/form-state";
import { FieldError } from "@/ui/field";

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
  it("renders every message, not the first", () => {
    render(<FieldError id="password-errors" messages={PASSWORD_RULES} />);

    // The rule this component exists to hold. One sentence, or the first of
    // four, turns a single correction into four round trips.
    expect(screen.getAllByRole("listitem")).toHaveLength(PASSWORD_RULES.length);
  });

  it("carries the id the input points at", () => {
    render(<FieldError id="password-errors" messages={PASSWORD_RULES} />);

    // Without this the messages are read as loose text near the field rather
    // than as part of it.
    expect(screen.getByRole("list").id).toBe("password-errors");
  });
});

describe("a field with nothing wrong", () => {
  it.each([[undefined], [[]]])("renders nothing at all (%s)", (messages) => {
    const { container } = render(<FieldError id="password-errors" messages={messages} />);

    // An empty list would still be an element for `aria-describedby` to point
    // at, and a screen reader would announce a list with no items.
    expect(container.innerHTML).toBe("");
  });
});

describe("the reason a session ended", () => {
  it("says plainly when the account was signed out everywhere", () => {
    render(<SessionEndedNotice reason="revoked" />);

    expect(screen.getByRole("alert").textContent).toContain("signed out of every device");
  });

  it("stays calm about an ordinary expiry", () => {
    render(<SessionEndedNotice reason="expired" />);

    const alert = screen.getByRole("alert");
    // A routine expiry must not read like a security event, or the wording for
    // the one that is stops meaning anything.
    expect(alert.textContent).not.toContain("signed out of every device");
    expect(alert.textContent).toContain("sign in again");
  });
});

const HINT = "At least 8 characters, with an uppercase letter, a lowercase letter and a symbol.";

type Action = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

const inert: Action = () => Promise.resolve(EMPTY_FORM_STATE);

/** Signing in: no hint, and the password manager should offer a stored secret. */
function renderSignIn(action: Action = inert) {
  return render(
    <CredentialForm
      action={action}
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      passwordAutoComplete="current-password"
    />,
  );
}

/** Registering: the policy is stated up front, so there is a hint to describe. */
function renderRegister(action: Action = inert) {
  return render(
    <CredentialForm
      action={action}
      submitLabel="Create account"
      pendingLabel="Creating account…"
      passwordAutoComplete="new-password"
      passwordHint={HINT}
    />,
  );
}

/** Every id in an `aria-describedby`, or an empty list when there is none. */
function describedBy(field: HTMLElement): string[] {
  const value = field.getAttribute("aria-describedby");
  return value === null ? [] : value.split(" ").filter(Boolean);
}

function submit(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("the credential form as first rendered", () => {
  it("associates both labels with their inputs", () => {
    renderSignIn();

    // `getByLabelText` resolves through the label, so it passing *is* the
    // assertion: an unassociated label finds nothing.
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("tells the password manager which secret this is", () => {
    renderSignIn();

    expect(screen.getByLabelText("Email").getAttribute("autocomplete")).toBe("email");
    // The one prop that differs between the two pages. Offering a stored
    // password on a registration form, or a new one on sign-in, is the failure.
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
  });

  it("uses the registration autocomplete when registering", () => {
    renderRegister();

    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
  });

  it("describes the password by its hint alone, and claims nothing is wrong", () => {
    renderRegister();

    const password = screen.getByLabelText("Password");
    const [hintId, ...rest] = describedBy(password);

    // Asserted by what the id resolves to rather than by its name: the shared
    // field wiring generates ids, so naming one would test React's counter.
    expect(rest).toEqual([]);
    expect(document.getElementById(hintId ?? "")?.textContent).toBe(HINT);
    expect(password.getAttribute("aria-invalid")).toBe("false");
  });

  it("describes nothing when there is no hint", () => {
    renderSignIn();

    expect(describedBy(screen.getByLabelText("Password"))).toEqual([]);
  });
});

describe("a password the API refused", () => {
  const refuses: Action = () =>
    Promise.resolve({ fieldErrors: { password: PASSWORD_RULES }, formError: null });

  it("keeps the hint and adds the errors, and both ids resolve", async () => {
    renderRegister(refuses);
    submit("Create account");

    // Awaited because the action is a promise: the state arrives after it
    // settles, however fast that is.
    await screen.findByRole("list");

    const password = screen.getByLabelText("Password");
    const ids = describedBy(password);

    // The assertion that matters. A describedby naming an element that is not
    // there is invisible to everyone except the person relying on it.
    for (const id of ids) {
      expect(document.getElementById(id), `#${id} is not in the document`).not.toBeNull();
    }

    // Both, in that order - the complaint first and the standing rule after it.
    // Dropping the hint on the first refusal leaves the rules unreadable exactly
    // when they are needed; dropping the errors makes the refusal silent to
    // anyone not looking at the red text.
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0] ?? "")?.tagName).toBe("UL");
    expect(document.getElementById(ids[1] ?? "")?.textContent).toBe(HINT);

    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByRole("listitem")).toHaveLength(PASSWORD_RULES.length);
  });

  it("leaves the email alone", async () => {
    renderRegister(refuses);
    submit("Create account");
    await screen.findByRole("list");

    // One refused field must not mark the other. `aria-invalid` on an untouched
    // input sends a screen-reader user hunting for a problem that isn't there.
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("false");
  });
});

describe("credentials that were simply wrong", () => {
  const refuses: Action = () =>
    Promise.resolve({ fieldErrors: {}, formError: "The email or password is incorrect." });

  it("says so above the form and blames neither field", async () => {
    renderSignIn(refuses);
    submit("Sign in");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("email or password is incorrect");

    // The API refuses to say which half was wrong so that nobody can discover
    // which addresses have accounts. Marking a field would give that away on
    // this side instead.
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("false");
  });
});

describe("the form in flight", () => {
  it("disables the button and says what it is doing", async () => {
    let finish: (state: AuthFormState) => void = () => undefined;
    const pending = new Promise<AuthFormState>((resolve) => {
      finish = resolve;
    });

    renderSignIn(() => pending);
    submit("Sign in");

    // A second submit while the first is in flight is a second registration or
    // a second login attempt against a rate limit, so the button has to refuse.
    // The DOM property rather than a matcher: this suite has no jest-dom, which
    // would be a dependency for sugar over one property read.
    const button = await screen.findByRole<HTMLButtonElement>("button", { name: "Signing in…" });
    expect(button.disabled).toBe(true);

    finish(EMPTY_FORM_STATE);

    const settled = await screen.findByRole<HTMLButtonElement>("button", { name: "Sign in" });
    expect(settled.disabled).toBe(false);
  });
});
