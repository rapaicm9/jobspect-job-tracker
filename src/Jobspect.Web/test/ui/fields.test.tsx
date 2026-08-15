/**
 * @vitest-environment jsdom
 *
 * Per-file rather than configured, for the reason `test/auth/components.test.tsx`
 * records. That file's header also carries the two-copies-of-React breadcrumb,
 * which applies to every primitive rendered here.
 */
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  EMPTY_MONEY,
  optionalDate,
  optionalMoney,
  optionalText,
  requiredText,
} from "@/lib/form-schema";
import { DateField } from "@/ui/fields/date-field";
import { FormActions } from "@/ui/fields/form-actions";
import { MoneyField } from "@/ui/fields/money-field";
import { SelectField } from "@/ui/fields/select-field";
import { TextareaField } from "@/ui/fields/textarea-field";
import { TextField } from "@/ui/fields/text-field";

afterEach(cleanup);

const MONEY_MESSAGES = {
  notANumber: "Enter the compensation as a number.",
  amountWithoutCurrency: "Add a currency code, for example EUR.",
  currencyWithoutAmount: "Add an amount, or clear the currency.",
};

const WORK_MODES = [
  { value: "Onsite", label: "Onsite" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "Remote", label: "Remote" },
];

const schema = z.object({
  role: requiredText("A role is required."),
  notes: optionalText(),
  workMode: z.enum(["Onsite", "Hybrid", "Remote"]).nullable(),
  appliedDate: optionalDate("Enter a date."),
  compensation: optionalMoney(MONEY_MESSAGES),
});

type Input = z.input<typeof schema>;
type Output = z.output<typeof schema>;

const EMPTY: Input = {
  role: "",
  notes: "",
  workMode: null,
  appliedDate: "",
  compensation: EMPTY_MONEY,
};

const HINT = "Anything worth remembering.";

function Harness({
  onValid = () => undefined,
  defaults = EMPTY,
}: {
  onValid?: (values: Output) => void;
  defaults?: Input;
}) {
  const form = useForm<Input, unknown, Output>({
    resolver: standardSchemaResolver(schema),
    // Without this a field that broke several rules reports only the first, and
    // the whole list-per-field rule has nothing to render.
    criteriaMode: "all",
    defaultValues: defaults,
  });

  return (
    <form onSubmit={form.handleSubmit(onValid)} noValidate>
      <TextField control={form.control} name="role" label="Role" />
      <TextareaField control={form.control} name="notes" label="Notes" description={HINT} />
      <SelectField control={form.control} name="workMode" label="Work mode" options={WORK_MODES} />
      <DateField control={form.control} name="appliedDate" label="Applied" />
      <MoneyField control={form.control} name="compensation" legend="Compensation" />
      <FormActions submitLabel="Save" pendingLabel="Saving…" pending={false} />
    </form>
  );
}

/** Every id in an `aria-describedby`, or an empty list when there is none. */
function describedBy(field: HTMLElement): string[] {
  const value = field.getAttribute("aria-describedby");
  return value === null ? [] : value.split(" ").filter(Boolean);
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("every field as first rendered", () => {
  it.each([["Role"], ["Notes"], ["Applied"], ["Amount"], ["Currency"]])(
    "associates its label with its control (%s)",
    (label) => {
      render(<Harness />);

      // `getByLabelText` resolves through the label, so it passing *is* the
      // assertion: an unassociated label finds nothing.
      expect(screen.getByLabelText(label)).toBeTruthy();
    },
  );

  it("claims nothing is wrong, rather than staying silent about it", () => {
    render(<Harness />);

    expect(screen.getByLabelText("Role").getAttribute("aria-invalid")).toBe("false");
  });

  it("describes a field by its hint when it has one", () => {
    render(<Harness />);

    const notes = screen.getByLabelText("Notes");
    const [hintId, ...rest] = describedBy(notes);

    expect(rest).toEqual([]);
    expect(document.getElementById(hintId ?? "")?.textContent).toBe(HINT);
  });

  it("describes a field by nothing when it has no hint", () => {
    render(<Harness />);

    expect(describedBy(screen.getByLabelText("Role"))).toEqual([]);
  });
});

describe("a field the form refused", () => {
  it("marks it, points it at the messages, and leaves its neighbour alone", async () => {
    render(<Harness />);
    save();

    const role = await screen.findByLabelText("Role");
    await waitFor(() => {
      expect(role.getAttribute("aria-invalid")).toBe("true");
    });

    const [errorsId] = describedBy(role);
    expect(document.getElementById(errorsId ?? "")?.textContent).toContain("A role is required.");

    // One refused field must not mark the others. `aria-invalid` on an untouched
    // input sends a screen-reader user hunting for a problem that isn't there.
    expect(screen.getByLabelText("Notes").getAttribute("aria-invalid")).toBe("false");
  });

  it("keeps the hint alongside the messages rather than replacing it", async () => {
    const twoRules = z.object({
      password: z
        .string()
        .min(8, "The password must be at least 8 characters long.")
        .regex(/[A-Z]/, "The password must contain an uppercase letter."),
    });

    function Password() {
      const form = useForm<z.input<typeof twoRules>, unknown, z.output<typeof twoRules>>({
        resolver: standardSchemaResolver(twoRules),
        criteriaMode: "all",
        defaultValues: { password: "" },
      });

      return (
        <form onSubmit={form.handleSubmit(() => undefined)} noValidate>
          <TextField control={form.control} name="password" label="Password" description={HINT} />
          <FormActions submitLabel="Save" pendingLabel="Saving…" pending={false} />
        </form>
      );
    }

    render(<Password />);
    save();

    await screen.findByRole("list");

    const password = screen.getByLabelText("Password");
    const ids = describedBy(password);

    for (const id of ids) {
      expect(document.getElementById(id), `#${id} is not in the document`).not.toBeNull();
    }

    // The complaint first, then the standing rule. Losing the hint on the first
    // refusal takes away the instruction exactly when it is needed.
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[1] ?? "")?.textContent).toBe(HINT);

    // Both rules at once. One at a time turns a single correction into two
    // round trips, which is the whole reason the renderer is a list.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("the money pair", () => {
  it("reports one problem at the group, not one per box", async () => {
    render(<Harness />);

    // The role is filled so the money pair is the only thing left to refuse,
    // and the single list below is unambiguous about which field produced it.
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Frontend Engineer" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "75000" } });
    save();

    await screen.findByRole("list");

    // The API has no field for an amount and no field for a currency, so
    // blaming one of the boxes would be a guess this form has no basis for.
    const messages = screen.getAllByRole("listitem");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.textContent).toBe(MONEY_MESSAGES.amountWithoutCurrency);

    // And both boxes point at that one list, so it is read from either.
    const amount = screen.getByLabelText("Amount");
    const currency = screen.getByLabelText("Currency");
    expect(describedBy(amount)).toEqual(describedBy(currency));
    expect(document.getElementById(describedBy(amount)[0] ?? "")).not.toBeNull();
  });

  it("submits no compensation at all when both boxes are empty", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Frontend Engineer" } });
    save();

    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });

    // The rule the whole schema layer exists for, proven through the control
    // rather than through the parser alone: an untouched pair of boxes is no
    // compensation, and never a salary of zero.
    expect(onValid.mock.calls[0]?.[0]).toMatchObject({ compensation: null });
  });

  it("hands over a number and an uppercased code once both are filled", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Frontend Engineer" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "75000" } });
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "eur" } });
    save();

    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });

    expect(onValid.mock.calls[0]?.[0]).toMatchObject({
      compensation: { amount: 75000, currency: "EUR" },
    });
  });
});

/**
 * Base UI's select commits on pointer events rather than on a click, so a bare
 * `fireEvent.click` on an item opens nothing and changes nothing - it reads as
 * the option being ignored. The three events below are what a real pointer
 * sends.
 */
function choose(name: string) {
  const option = screen.getByRole("option", { name });
  fireEvent.pointerDown(option);
  fireEvent.pointerUp(option);
  fireEvent.click(option);
}

describe("a select", () => {
  it("hands over the value that was picked", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Frontend Engineer" } });
    fireEvent.click(screen.getByLabelText("Work mode"));
    await screen.findByRole("option", { name: "Remote" });
    choose("Remote");
    save();

    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });

    expect(onValid.mock.calls[0]?.[0]).toMatchObject({ workMode: "Remote" });
  });

  it("hands over null when an existing answer is taken back", async () => {
    const onValid = vi.fn();
    // Starts answered, which is the case that matters: hydrating an edit form
    // from a record that has a work mode and then clearing it.
    render(<Harness onValid={onValid} defaults={{ ...EMPTY, workMode: "Onsite" }} />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Frontend Engineer" } });
    fireEvent.click(screen.getByLabelText("Work mode"));
    await screen.findByRole("option", { name: "Not set" });
    choose("Not set");

    save();

    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });

    // Null rather than "". Not recording a work mode is a real answer, and an
    // empty string in its place is something the far side has to guess at.
    expect(onValid.mock.calls[0]?.[0]).toMatchObject({ workMode: null });
  });
});

describe("a blank optional field", () => {
  it("is submitted as null rather than as an empty string", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Frontend Engineer" } });
    save();

    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });

    // "" is an answer to every check for presence, and the API's company rule
    // refuses an id and a name together on exactly that basis.
    expect(onValid.mock.calls[0]?.[0]).toMatchObject({
      notes: null,
      appliedDate: null,
      workMode: null,
    });
  });
});
