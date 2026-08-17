import { describe, expect, it } from "vitest";

import type { Contact } from "@/features/applications/contact";
import type { ContactFormOutput } from "@/features/applications/contact-form-schema";
import { toContactRequest } from "@/features/applications/to-contact-request";

const APPLICATION_ID = "application-1";

function values(overrides: Partial<ContactFormOutput> = {}): ContactFormOutput {
  return {
    name: "Dana Whitfield",
    role: "HiringManager",
    email: "dana@acme.test",
    phone: "+44 20 7946 0000",
    notes: "Met at the meetup.",
    ...overrides,
  };
}

function stored(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1",
    applicationId: APPLICATION_ID,
    companyId: "company-1",
    name: "Dana Whitfield",
    role: "HiringManager",
    email: "dana@acme.test",
    phone: "+44 20 7946 0000",
    notes: "Met at the meetup.",
    ...overrides,
  };
}

describe("recording a contact", () => {
  it("links them to this application and to no company", () => {
    // The panel records the people on an application, and the API is satisfied by
    // that link alone. Stamping the application's company would record a
    // connection the user never made - and the wrong one as soon as somebody
    // retypes the company name, since that resolves to a different id.
    const body = toContactRequest(null, values(), APPLICATION_ID);

    expect(body).toMatchObject({ applicationId: APPLICATION_ID, companyId: null });
  });

  it("sends the same seven fields an edit does", () => {
    // One request shape for both, unlike the interview pair - so there is no
    // delta to state and nothing to keep in step.
    expect(Object.keys(toContactRequest(null, values(), APPLICATION_ID)).toSorted()).toEqual([
      "applicationId",
      "companyId",
      "email",
      "name",
      "notes",
      "phone",
      "role",
    ]);
  });
});

describe("editing a contact", () => {
  it("carries back both links, which the form never shows", () => {
    // The ones at risk: a replace that dropped either would change the record and
    // leave the screen looking exactly as it did.
    const body = toContactRequest(stored(), values({ name: "Dana W." }), APPLICATION_ID);

    expect(body).toEqual({
      applicationId: APPLICATION_ID,
      companyId: "company-1",
      name: "Dana W.",
      role: "HiringManager",
      email: "dana@acme.test",
      phone: "+44 20 7946 0000",
      notes: "Met at the meetup.",
    });
  });

  it("keeps a company this screen has no way to have set", () => {
    // A contact can be linked to a company by something that is not this panel.
    // Whatever put it there, an edit here is not the place it gets dropped.
    const body = toContactRequest(stored({ companyId: "elsewhere" }), values(), APPLICATION_ID);

    expect(body.companyId).toBe("elsewhere");
  });

  it("re-sends the stored application rather than the one on screen", () => {
    // They agree today, because the panel reads by application. A replace still
    // sends what the record holds rather than what the screen assumes.
    const body = toContactRequest(stored({ applicationId: "another" }), values(), APPLICATION_ID);

    expect(body.applicationId).toBe("another");
  });

  it("clears text the user actually emptied", () => {
    // Null, not "". The schema has already made the blank a null; what this pins
    // is that nothing downstream turns it back into a value the API would store.
    const body = toContactRequest(
      stored(),
      values({ email: null, phone: null, notes: null, role: null }),
      APPLICATION_ID,
    );

    expect(body).toMatchObject({ email: null, phone: null, notes: null, role: null });
  });
});
