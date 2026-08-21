// Stands in for Jobspect.Api so the authenticated suite can sign a browser in.
//
// A separate process rather than MSW, because the code under test runs in the
// Next server: an in-process interceptor in the Playwright runner would never
// see the call. It still mocks the HTTP boundary and nothing above it - the
// Server Actions, the session store and the DAL are all the real ones.
//
// `.mts` rather than `.ts`: the package declares no "type": "module", so Node
// would load a .ts file as CommonJS and refuse the imports below. The .mts
// extension is unambiguously ESM, and Node 24 strips the types on its own.
//
// The identity model here is a stub - tokens are random strings, passwords are
// compared literally, everything lives in a Map and dies with the process. What
// it does honour is the contract's shapes, so the type-only import below turns a
// backend response change into a failed typecheck rather than a puzzling spec.

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { components } from "../../src/server/api/schema";

type AuthTokensResponse = components["schemas"]["AuthTokensResponse"];
type AccountResponse = components["schemas"]["AccountResponse"];
type ApplicationResponse = components["schemas"]["ApplicationResponse"];
type ApplicationSummaryResponse = components["schemas"]["ApplicationSummaryResponse"];
type CampaignResponse = components["schemas"]["CampaignResponse"];
type ContactResponse = components["schemas"]["ContactResponse"];
type CustomFieldResponse = components["schemas"]["CustomFieldResponse"];
type InterviewResponse = components["schemas"]["InterviewResponse"];
type ActivityEntryResponse = components["schemas"]["ActivityEntryResponse"];
type ActivityPage = components["schemas"]["PagedResponseOfActivityEntryResponse"];
type ApplicationPage = components["schemas"]["PagedResponseOfApplicationSummaryResponse"];
type ContactPage = components["schemas"]["PagedResponseOfContactResponse"];
type InterviewPage = components["schemas"]["PagedResponseOfInterviewResponse"];
type PlanStatusResponse = components["schemas"]["PlanStatusResponse"];
type PlanTier = components["schemas"]["PlanTier"];
type CreateApplicationRequest = components["schemas"]["CreateApplicationRequest"];
type UpdateApplicationRequest = components["schemas"]["UpdateApplicationRequest"];
type CreateInterviewRequest = components["schemas"]["CreateInterviewRequest"];
type UpdateInterviewRequest = components["schemas"]["UpdateInterviewRequest"];
type CreateContactRequest = components["schemas"]["CreateContactRequest"];
type UpdateContactRequest = components["schemas"]["UpdateContactRequest"];
type RegisterRequest = components["schemas"]["RegisterRequest"];
type LoginRequest = components["schemas"]["LoginRequest"];
type RefreshRequest = components["schemas"]["RefreshRequest"];
type LogoutRequest = components["schemas"]["LogoutRequest"];

/**
 * The calls a spec can arm to fail: the three reads the detail screen degrades
 * one panel over rather than failing on, plus the one write on that screen.
 */
type FailableCall =
  | "custom-fields"
  | "contacts"
  | "interviews"
  | "activity"
  | "add-note"
  | "create-application"
  | "create-interview"
  | "create-contact"
  | "transition-in-flight"
  | "transition-unavailable"
  | "transition-illegal"
  | "delete-application";

const APPLICATION_PATH = /^\/api\/v1\/applications\/([^/]+)$/;
const INTERVIEWS_PATH = /^\/api\/v1\/applications\/([^/]+)\/interviews$/;
const INTERVIEW_PATH = /^\/api\/v1\/applications\/([^/]+)\/interviews\/([^/]+)$/;
const CONTACT_PATH = /^\/api\/v1\/contacts\/([^/]+)$/;
const ACTIVITY_PATH = /^\/api\/v1\/applications\/([^/]+)\/activity$/;
const TRANSITION_PATH = /^\/api\/v1\/applications\/([^/]+)\/transition$/;

type StageName = ApplicationResponse["stage"];
type TransitionKind = NonNullable<ActivityEntryResponse["transitionKind"]>;

/** The live pipeline in order, as the aggregate holds it. */
const PIPELINE: StageName[] = ["Applied", "Screening", "Interview", "Offer"];

const OUTCOMES: StageName[] = ["Accepted", "Rejected", "Withdrawn", "Ghosted"];

function toStageName(value: string): StageName | undefined {
  return [...PIPELINE, ...OUTCOMES].find((stage) => stage === value);
}

/**
 * The state machine, transcribed from the aggregate rather than from the client.
 *
 * The whole value of a fake here is that it refuses what the real one refuses:
 * the client's model is a convenience, and this is what lets a spec drive a move
 * the menu would never offer and still get the real answer.
 */
function transitionKindOf(from: StageName, to: StageName): TransitionKind | null {
  if (from === to) return null;

  const fromActive = PIPELINE.includes(from);
  const toActive = PIPELINE.includes(to);

  // Active to active: either direction, skips allowed both ways.
  if (fromActive && toActive) {
    return PIPELINE.indexOf(to) > PIPELINE.indexOf(from) ? "Advance" : "StepBack";
  }

  // Active to terminal: Accepted needs an offer, the rest reach from anywhere.
  if (fromActive) return to !== "Accepted" || from === "Offer" ? "Terminal" : null;

  // Terminal to active is a reopen; terminal to terminal corrects the outcome,
  // and Accepted stays out of reach because it is earned from Offer alone.
  if (toActive) return "Reopen";

  return to === "Accepted" ? null : "Reclassify";
}

/** The API's own cap on a note, so the fake refuses what the real handler does. */
const NOTE_MAX_LENGTH = 2000;

// An hour, so nothing in the suite crosses the 60s refresh skew by accident. A
// spec that wants a rotation should ask for one rather than wait for one.
const ACCESS_TOKEN_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_TIME_ZONE = "Etc/UTC";

interface Account {
  userId: string;
  email: string;
  password: string;
  timeZoneId: string;
  createdAt: string;
}

interface RefreshTokenRecord {
  userId: string;
  retired: boolean;
}

const accounts = new Map<string, Account>();
const accessTokens = new Map<string, string>();
const refreshTokens = new Map<string, RefreshTokenRecord>();

// Keyed by account so two specs running at once cannot read each other's rows,
// which is what lets the suite stay fully parallel against one process.
//
// Whole applications rather than the summaries the list reads: the detail screen
// wants the fields the summary leaves out, and deriving the summary from the
// application keeps one seed answering both reads.
const applications = new Map<string, ApplicationResponse[]>();

const customFields = new Map<string, CustomFieldResponse[]>();
const contacts = new Map<string, ContactResponse[]>();
const interviews = new Map<string, InterviewResponse[]>();

/**
 * The account's tier, Free unless a spec says otherwise.
 *
 * It decides what an absent custom-field bag means to the update below, which
 * is the one place on this screen where the same request does opposite things.
 */
const plans = new Map<string, PlanTier>();

/**
 * The last body a full replace actually sent, per account.
 *
 * Recorded because the assertion that matters is not what the screen shows
 * afterwards - it is that fourteen fields the user never touched went back out
 * carrying what they came in with.
 */
const lastUpdates = new Map<string, unknown>();

/** The same question for a round, whose replace clears its notes just as easily. */
const lastInterviewWrites = new Map<string, unknown>();

/** And for a contact, whose replace also carries two links nothing renders. */
const lastContactWrites = new Map<string, unknown>();

/**
 * The timeline carries no application id on the wire - the whole feed is read
 * under one application - so the association is the fake's to hold.
 */
interface StoredEntry {
  applicationId: string;
  entry: ActivityEntryResponse;
}

const activity = new Map<string, StoredEntry[]>();

/**
 * Every `Idempotency-Key` this account has sent, in order.
 *
 * Recorded rather than honoured: replaying a response is the real middleware's
 * job and no spec here needs one. What a spec does need is to see that a key went
 * out at all, and that a retry sent the same one.
 */
const idempotencyKeys = new Map<string, string[]>();

/**
 * Which calls answer 500 for this account, armed by a test seam.
 *
 * Keyed by account for the reason the cursor arming is: the suite runs its specs
 * in parallel against one process, and a single flag here is one another spec's
 * page load can spend first.
 */
const failingCalls = new Map<string, Set<FailableCall>>();

/**
 * A read stays armed; a write is spent on its first refusal.
 *
 * The reads are armed to assert what a panel shows while its read is down, which
 * has to survive however many times the page renders. A write is armed to assert
 * what the second attempt does - the retry that carries the same key, or the
 * refusal a user reads - and an arming that could never be got past would prove
 * only half of that.
 */
function isFailing(userId: string, call: FailableCall): boolean {
  const armed = failingCalls.get(userId);
  if (armed === undefined || !armed.has(call)) return false;

  if (call !== "custom-fields" && call !== "contacts" && call !== "interviews") {
    armed.delete(call);
  }
  return true;
}

/** Counted so a spec can assert the first page is not fetched twice. */
const listCalls = new Map<string, number>();

// Every account gets one on registration, as the real one does. A second only
// exists where a spec asked for it, which is what makes the switcher's "hidden
// until there is a choice" rule assertable from both sides.
const campaigns = new Map<string, CampaignResponse[]>();

/**
 * Armed by a test seam; spent by that account's next cursored read.
 *
 * Keyed by account for the same reason the rows are: the suite runs its specs in
 * parallel against one process, and a single flag here is a flag another spec's
 * "load more" can spend first. That failure only appears at some worker counts,
 * which is the worst kind.
 */
const expiredCursors = new Set<string>();

/**
 * Which stage-filtered list reads answer 500, per account.
 *
 * Separate from `failingCalls`, whose vocabulary is one entry per endpoint and so
 * cannot tell two reads of the same endpoint apart. The board makes five of them
 * and degrades each one on its own, and the assertion worth having is that one
 * broken column leaves the other three standing - which needs a seam that can
 * refuse exactly one.
 *
 * Armed rather than spent, like the other read armings: the page renders more than
 * once and the column has to still be down when it does.
 */
const failingStageReads = new Map<string, Set<string>>();

/** Whether this read is the one a spec armed, by the stages it asked for. */
function isFailingStageRead(userId: string, stages: string[]): boolean {
  const armed = failingStageReads.get(userId);
  if (armed === undefined) return false;

  // Every stage the read named has to be armed. A read of one stage matches the
  // arming for that stage; the closed count, which names four, matches only an
  // arming that covers all four.
  return stages.length > 0 && stages.every((stage) => armed.has(stage));
}

function accountKey(email: string): string {
  return email.trim().toLowerCase();
}

function createAccount(email: string, password: string, timeZoneId: string | null): Account {
  const account: Account = {
    userId: randomUUID(),
    email,
    password,
    timeZoneId: timeZoneId ?? DEFAULT_TIME_ZONE,
    createdAt: new Date().toISOString(),
  };

  accounts.set(accountKey(email), account);

  // The real API creates a default campaign when an account registers, and the
  // switcher's whole behaviour turns on how many there are.
  campaigns.set(account.userId, [
    {
      id: randomUUID(),
      name: "Job search",
      isDefault: true,
      applicationCount: 0,
      createdAt: account.createdAt,
      updatedAt: null,
    },
  ]);

  return account;
}

function issueTokens(userId: string): AuthTokensResponse {
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  const now = Date.now();

  accessTokens.set(accessToken, userId);
  refreshTokens.set(refreshToken, { userId, retired: false });

  return {
    userId,
    accessToken,
    accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_MS).toISOString(),
    refreshToken,
    refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_MS).toISOString(),
  };
}

function send(response: ServerResponse, status: number, body: unknown): void {
  if (body === undefined) {
    response.writeHead(status).end();
    return;
  }

  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

/**
 * RFC 9457, carrying `code`. The client branches on that member and treats the
 * status as a floor, so a wrong status here is survivable and a wrong code is
 * not.
 */
function sendProblem(response: ServerResponse, status: number, code: string, detail: string): void {
  const payload = JSON.stringify({
    type: `https://jobspect.test/problems/${code}`,
    title: "Request failed",
    status,
    detail,
    code,
  });

  response.writeHead(status, {
    "content-type": "application/problem+json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

/**
 * A problem with no `code`, which is what a failure no endpoint named looks
 * like - an outage, a proxy, anything below the application. The client falls
 * back to the status family for these rather than guessing, and that fallback is
 * the thing worth exercising.
 */
function sendUncodedProblem(response: ServerResponse, status: number, detail: string): void {
  const payload = JSON.stringify({
    type: "about:blank",
    title: "Request failed",
    status,
    detail,
  });

  response.writeHead(status, {
    "content-type": "application/problem+json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

/**
 * The other 422 shape: field-keyed messages and no `code` at all.
 *
 * Kept apart from `sendProblem` because the client reads whichever member is
 * present, and a body carrying both would be one no real endpoint sends.
 */
function sendValidationProblem(response: ServerResponse, errors: Record<string, string[]>): void {
  const payload = JSON.stringify({
    type: "https://jobspect.test/problems/validation",
    title: "One or more validation errors occurred.",
    status: 422,
    errors,
  });

  response.writeHead(422, {
    "content-type": "application/problem+json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readJson<T>(request: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);

  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw === "") return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function bearerOf(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

/** Whose request this is, or undefined for a token the fake has never issued. */
function callerId(request: IncomingMessage): string | undefined {
  const token = bearerOf(request);
  return token === null ? undefined : accessTokens.get(token);
}

/**
 * Fills in everything a spec did not care to state.
 *
 * A list spec is about columns, so it names the fields it asserts and lets the
 * rest be plausible - which keeps the interesting values visible in the spec
 * rather than buried in a full DTO literal.
 */
function anApplication(seed: Partial<ApplicationResponse>): ApplicationResponse {
  return {
    id: randomUUID(),
    campaignId: randomUUID(),
    companyId: null,
    companyName: null,
    stage: "Applied",
    role: "Engineer",
    compensation: null,
    location: null,
    workMode: null,
    postingUrl: null,
    source: null,
    appliedDate: "2026-08-01",
    applicationDeadline: null,
    offerDecisionDeadline: null,
    cvLabel: null,
    coverLetterLabel: null,
    customFields: {},
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...seed,
  };
}

/**
 * The campaign an application opens in when the request names none.
 *
 * The real handler resolves the account's default, and every account is
 * provisioned one at registration - so an account with no campaigns at all is an
 * invariant breach rather than something a client can cause.
 */
function defaultCampaignId(userId: string): string {
  const owned = campaigns.get(userId) ?? [];
  const fallback = owned.find((campaign) => campaign.isDefault) ?? owned[0];

  return fallback?.id ?? randomUUID();
}

/**
 * The three ways the real handler refuses a full replace, implemented rather
 * than armed by a seam.
 *
 * Each is a rule about the request the client just built, so a spec that asserts
 * the refusal is asserting the client got the rule wrong - which is what these
 * are worth testing. An arming seam would only prove the form can render an
 * error somebody handed it.
 */
function refuseUpdate(
  userId: string,
  stored: ApplicationResponse,
  body: UpdateApplicationRequest,
): ((response: ServerResponse) => void) | null {
  if (body.role === null || body.role.trim() === "") {
    return (response) => sendValidationProblem(response, { role: ["A role is required."] });
  }

  if (body.appliedDate === null || body.appliedDate === "") {
    return (response) =>
      sendValidationProblem(response, { appliedDate: ["An applied date is required."] });
  }

  // Compared against what is stored, so what it refuses is the change rather
  // than the value: an application keeps the deadline it was given after it
  // leaves Offer, and a full replace sends that back every time.
  if (
    body.offerDecisionDeadline !== null &&
    body.offerDecisionDeadline !== stored.offerDecisionDeadline &&
    stored.stage !== "Offer"
  ) {
    return (response) =>
      sendProblem(
        response,
        422,
        "application.offer_deadline_requires_offer",
        "An offer decision deadline can only be set while the application is at Offer.",
      );
  }

  if (body.customFields !== null && (plans.get(userId) ?? "Free") !== "Pro") {
    return (response) =>
      sendProblem(response, 403, "custom_field.not_entitled", "Custom fields are part of Pro.");
  }

  return null;
}

/** The replace itself. Every field, because that is what a replace means. */
function applyUpdate(stored: ApplicationResponse, body: UpdateApplicationRequest): void {
  stored.role = body.role!;
  stored.campaignId = body.campaignId ?? stored.campaignId;

  if (body.companyName !== null && body.companyName !== "") {
    // Resolve-or-create, near enough: a name the client sends on its own always
    // means "this company, whatever its id".
    stored.companyId = randomUUID();
    stored.companyName = body.companyName;
  } else if (body.companyId === null) {
    stored.companyId = null;
    stored.companyName = null;
  }

  stored.compensation =
    body.compensation === null
      ? null
      : { ...body.compensation, currency: body.compensation.currency ?? "EUR" };
  stored.location = body.location;
  stored.workMode = body.workMode as ApplicationResponse["workMode"];
  stored.postingUrl = body.postingUrl;
  stored.source = body.source;
  stored.appliedDate = body.appliedDate!;
  stored.applicationDeadline = body.applicationDeadline;
  stored.offerDecisionDeadline = body.offerDecisionDeadline;
  stored.cvLabel = body.cvLabel;
  stored.coverLetterLabel = body.coverLetterLabel;

  // Null retains, which is the asymmetry the whole commit is about.
  if (body.customFields !== null) stored.customFields = body.customFields;

  stored.updatedAt = new Date().toISOString();
}

/**
 * The list's read model, which is the detail's minus the fields only it shows.
 *
 * Written out rather than destructured down to it, so the compiler names any
 * column the summary grows instead of a spread quietly forwarding it.
 */
function toSummary(application: ApplicationResponse): ApplicationSummaryResponse {
  return {
    id: application.id,
    campaignId: application.campaignId,
    companyId: application.companyId,
    companyName: application.companyName,
    stage: application.stage,
    role: application.role,
    compensation: application.compensation,
    location: application.location,
    workMode: application.workMode,
    source: application.source,
    appliedDate: application.appliedDate,
    applicationDeadline: application.applicationDeadline,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
  };
}

function aCustomField(seed: Partial<CustomFieldResponse>): CustomFieldResponse {
  return {
    id: randomUUID(),
    label: "Field",
    type: "Text",
    options: [],
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...seed,
  };
}

function aContact(applicationId: string, seed: Partial<ContactResponse>): ContactResponse {
  return {
    id: randomUUID(),
    applicationId,
    companyId: null,
    name: "Contact",
    role: null,
    email: null,
    phone: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...seed,
  };
}

function anActivityEntry(seed: Partial<ActivityEntryResponse>): ActivityEntryResponse {
  return {
    id: randomUUID(),
    kind: "Note",
    occurredAt: new Date().toISOString(),
    fromStage: null,
    toStage: null,
    transitionKind: null,
    note: null,
    ...seed,
  };
}

const INTERVIEW_TYPES = ["PhoneScreen", "Technical", "HrInterview", "Onsite", "Other"];
const INTERVIEW_FORMATS = ["Remote", "Onsite", "Phone"];
const INTERVIEW_OUTCOMES = ["Pending", "Passed", "Failed", "Cancelled"];

/**
 * The shape rules the real handlers apply to a round, implemented rather than
 * armed by a seam - the same argument `refuseUpdate` records.
 *
 * Every field is checked before answering, because the real one collects its
 * complaints into a single dictionary and a form that renders only the first
 * would look right against a fake that sent only the first.
 *
 * The outcome is the update slice's alone: scheduling has no such field, since a
 * new round is always pending.
 */
const CONTACT_ROLES = ["Recruiter", "HiringManager", "Interviewer", "Referral", "Other"];

/**
 * The shape rules the real handlers apply to a contact, implemented rather than
 * armed - the same argument `refuseUpdate` and `refuseInterviewWrite` record.
 *
 * The email and phone checks are the real ones: shape, not deliverability. A
 * client that restated either would refuse values the API accepts, so the fake
 * has to answer them for a spec to prove the client does not.
 */
function refuseContactWrite(
  body: CreateContactRequest | UpdateContactRequest,
): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};

  // Keyed to applicationId, as the real validator keys it: one of the two links
  // has to be there and this is the one a client can do something about.
  if (body.applicationId === null && body.companyId === null) {
    errors.applicationId = ["A contact must be linked to an application, a company, or both."];
  }

  if (body.name === null || body.name.trim() === "") {
    errors.name = ["A name is required."];
  }

  if (body.role !== null && !CONTACT_ROLES.includes(body.role)) {
    errors.role = [
      "The role must be one of Recruiter, HiringManager, Interviewer, Referral or Other.",
    ];
  }

  // One @ with something either side and no spaces, which is all the API claims
  // to check - it never sends mail.
  if (body.email !== null && body.email !== "" && !/^[^\s@]+@[^\s@]+$/.test(body.email)) {
    errors.email = ["The email address is not valid."];
  }

  // Digits and the usual separators, at least three digits. Kept loose on
  // purpose: the API stores the number, it does not dial it.
  if (
    body.phone !== null &&
    body.phone !== "" &&
    (!/^[\d+\-().\s]+$/.test(body.phone) || (body.phone.match(/\d/g) ?? []).length < 3)
  ) {
    errors.phone = ["The phone number is not valid."];
  }

  if ((body.notes?.length ?? 0) > NOTE_MAX_LENGTH) {
    errors.notes = [`The notes must be ${String(NOTE_MAX_LENGTH)} characters or fewer.`];
  }

  return Object.keys(errors).length === 0 ? null : errors;
}

function refuseInterviewWrite(
  body: CreateInterviewRequest | UpdateInterviewRequest,
  outcome: string | null | undefined,
): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};

  if (body.scheduledAt === null || body.scheduledAt === "") {
    errors.scheduledAt = ["A scheduled time is required."];
  }

  if (body.type === null || !INTERVIEW_TYPES.includes(body.type)) {
    errors.type = ["The type must be one of PhoneScreen, Technical, HrInterview, Onsite or Other."];
  }

  if (body.format === null || !INTERVIEW_FORMATS.includes(body.format)) {
    errors.format = ["The format must be one of Remote, Onsite or Phone."];
  }

  if (outcome !== undefined && (outcome === null || !INTERVIEW_OUTCOMES.includes(outcome))) {
    errors.outcome = ["The outcome must be one of Pending, Passed, Failed or Cancelled."];
  }

  if ((body.notes?.length ?? 0) > NOTE_MAX_LENGTH) {
    errors.notes = [`The notes must be ${String(NOTE_MAX_LENGTH)} characters or fewer.`];
  }

  return Object.keys(errors).length === 0 ? null : errors;
}

function anInterview(applicationId: string, seed: Partial<InterviewResponse>): InterviewResponse {
  return {
    id: randomUUID(),
    applicationId,
    scheduledAt: "2026-08-20T09:00:00Z",
    type: "PhoneScreen",
    format: "Remote",
    outcome: "Pending",
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    ...seed,
  };
}

/** The tag the cursor carries, so a walk cannot survive a change of order. */
function sortTag(sortBy: string, descending: boolean): string {
  return `${sortBy}:${descending ? "desc" : "asc"}`;
}

function encodeCursor(sort: string, offset: number): string {
  return Buffer.from(`${sort}:${String(offset)}`).toString("base64url");
}

function decodeCursor(cursor: string): { sort: string; offset: number } | null {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf(":");
  const offset = Number(decoded.slice(separator + 1));

  if (separator === -1 || !Number.isInteger(offset)) return null;

  return { sort: decoded.slice(0, separator), offset };
}

function compareApplications(
  a: ApplicationResponse,
  b: ApplicationResponse,
  sortBy: string,
  descending: boolean,
): number {
  const left = sortBy === "applicationDeadline" ? a.applicationDeadline : a.appliedDate;
  const right = sortBy === "applicationDeadline" ? b.applicationDeadline : b.appliedDate;

  // Nulls last whichever way the sort runs, which is what the real query does:
  // an application with no deadline has not got a late one.
  if (left === null && right === null) return a.id < b.id ? -1 : 1;
  if (left === null) return 1;
  if (right === null) return -1;

  if (left === right) return a.id < b.id ? -1 : 1;
  return (left < right ? -1 : 1) * (descending ? -1 : 1);
}

function accountById(userId: string): Account | undefined {
  for (const account of accounts.values()) {
    if (account.userId === userId) return account;
  }
  return undefined;
}

const server = createServer((request, response) => {
  void route(request, response).catch((cause: unknown) => {
    console.error("The fake API threw.", cause);
    sendProblem(response, 500, "internal", "The fake API threw.");
  });
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const { method = "GET", url = "/" } = request;
  const path = new URL(url, "http://fake-api.test").pathname;

  if (method === "GET" && path === "/__health") {
    send(response, 200, { status: "ok" });
    return;
  }

  // Seeds an account without driving the register form, so a spec about signing
  // in is not also a spec about signing up.
  if (method === "POST" && path === "/__test/accounts") {
    const body = await readJson<{
      email: string;
      password: string;
      // Named by a spec that asserts an instant renders in the account's zone
      // rather than the runner's; every other spec leaves it to the default.
      timeZoneId?: string;
    }>(request);

    if (body === null || accounts.has(accountKey(body.email))) {
      sendProblem(response, 409, "registration.email_taken", "That account already exists.");
      return;
    }

    const account = createAccount(body.email, body.password, body.timeZoneId ?? null);
    send(response, 201, { userId: account.userId });
    return;
  }

  // Seeds a list for an account that already exists, so a spec about the table
  // is not also a spec about creating applications - which has no write endpoint
  // on this client yet anyway.
  if (method === "POST" && path === "/__test/applications") {
    const body = await readJson<{
      email: string;
      applications: Partial<ApplicationResponse>[];
    }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === undefined || body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Seed an account before its applications.");
      return;
    }

    applications.set(account.userId, body.applications.map(anApplication));
    send(response, 201, { count: body.applications.length });
    return;
  }

  // The account's field definitions. A spec names their ids so it can key
  // answers to them in the application seed; the fake fills in the rest.
  if (method === "POST" && path === "/__test/custom-fields") {
    const body = await readJson<{ email: string; fields: Partial<CustomFieldResponse>[] }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Seed an account before its custom fields.");
      return;
    }

    customFields.set(account.userId, body.fields.map(aCustomField));
    send(response, 201, { count: body.fields.length });
    return;
  }

  if (method === "POST" && path === "/__test/contacts") {
    const body = await readJson<{
      email: string;
      applicationId: string;
      contacts: Partial<ContactResponse>[];
    }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Seed an account before its contacts.");
      return;
    }

    contacts.set(
      account.userId,
      body.contacts.map((seed) => aContact(body.applicationId, seed)),
    );
    send(response, 201, { count: body.contacts.length });
    return;
  }

  if (method === "POST" && path === "/__test/interviews") {
    const body = await readJson<{
      email: string;
      applicationId: string;
      interviews: Partial<InterviewResponse>[];
    }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Seed an account before its interviews.");
      return;
    }

    interviews.set(
      account.userId,
      body.interviews.map((seed) => anInterview(body.applicationId, seed)),
    );
    send(response, 201, { count: body.interviews.length });
    return;
  }

  // Makes one of the detail screen's calls fail, so a panel that degrades can be
  // told apart from a page that does not, and a retried write from a first
  // attempt. See `isFailing` for which of them stay armed.
  if (method === "POST" && path === "/__test/fail-calls") {
    const body = await readJson<{ email: string; calls: FailableCall[] }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Name the account to fail calls for.");
      return;
    }

    failingCalls.set(account.userId, new Set(body.calls));
    send(response, 204, undefined);
    return;
  }

  // Fails the list read for named stages, which is how a board spec takes down
  // one column and leaves the rest of the screen standing.
  if (method === "POST" && path === "/__test/fail-stage-reads") {
    const body = await readJson<{ email: string; stages: string[] }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Name the account to fail stage reads for.");
      return;
    }

    failingStageReads.set(account.userId, new Set(body.stages));
    send(response, 204, undefined);
    return;
  }

  // Seeds a timeline. The API writes a Created entry with every application, so
  // a spec that wants history states it here rather than driving transitions
  // this client cannot make yet.
  if (method === "POST" && path === "/__test/activity") {
    const body = await readJson<{
      email: string;
      applicationId: string;
      entries: Partial<ActivityEntryResponse>[];
    }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Seed an account before its activity.");
      return;
    }

    activity.set(
      account.userId,
      body.entries.map((seed) => ({
        applicationId: body.applicationId,
        entry: anActivityEntry(seed),
      })),
    );
    send(response, 201, { count: body.entries.length });
    return;
  }

  // Every idempotency key this account has sent, in order.
  if (method === "GET" && path === "/__test/idempotency-keys") {
    const email = new URL(url, "http://fake-api.test").searchParams.get("email") ?? "";
    const account = accounts.get(accountKey(email));

    send(response, 200, {
      keys: account === undefined ? [] : (idempotencyKeys.get(account.userId) ?? []),
    });
    return;
  }

  // Forces the next cursored read to answer as a stale cursor. The real API
  // reaches that state when the order changes under a walk in flight, which no
  // client can be made to do on purpose - so the state is what gets seeded here
  // rather than the route to it.
  if (method === "POST" && path === "/__test/expire-cursors") {
    const body = await readJson<{ email: string }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (account === undefined) {
      sendProblem(response, 404, "account.not_found", "Name the account to expire cursors for.");
      return;
    }

    expiredCursors.add(account.userId);
    send(response, 204, undefined);
    return;
  }

  // How many times the client actually asked. The assertion it exists for is
  // that a server-rendered first page is not fetched a second time on mount.
  if (method === "GET" && path === "/__test/application-requests") {
    const email = new URL(url, "http://fake-api.test").searchParams.get("email") ?? "";
    const account = accounts.get(accountKey(email));

    send(response, 200, {
      count: account === undefined ? 0 : (listCalls.get(account.userId) ?? 0),
    });
    return;
  }

  // Adds a second campaign, which is the only way the switcher appears.
  if (method === "POST" && path === "/__test/campaigns") {
    const body = await readJson<{ email: string; name: string }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Seed an account before its campaigns.");
      return;
    }

    const campaign: CampaignResponse = {
      id: randomUUID(),
      name: body.name,
      isDefault: false,
      applicationCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };

    campaigns.set(account.userId, [...(campaigns.get(account.userId) ?? []), campaign]);
    send(response, 201, { id: campaign.id });
    return;
  }

  if (method === "GET" && path === "/api/v1/campaigns") {
    const token = bearerOf(request);
    const userId = token === null ? undefined : accessTokens.get(token);

    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    send(response, 200, campaigns.get(userId) ?? []);
    return;
  }

  if (method === "POST" && path === "/api/v1/applications") {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    // Recorded before the arming is checked, so a spec watching a retry sees the
    // key of the attempt that failed as well as the one that worked.
    const key = request.headers["idempotency-key"];
    if (typeof key === "string") {
      idempotencyKeys.set(userId, [...(idempotencyKeys.get(userId) ?? []), key]);
    }

    if (isFailing(userId, "create-application")) {
      sendProblem(response, 500, "internal", "The create write is armed to fail.");
      return;
    }

    const body = await readJson<CreateApplicationRequest>(request);

    if (body === null || body.role === null || body.role.trim() === "") {
      sendValidationProblem(response, { role: ["A role is required."] });
      return;
    }

    const created = anApplication({
      campaignId: body.campaignId ?? defaultCampaignId(userId),
      companyId: body.companyName === null ? null : randomUUID(),
      companyName: body.companyName,
      role: body.role.trim(),
      compensation:
        body.compensation === null
          ? null
          : { amount: body.compensation.amount, currency: body.compensation.currency ?? "EUR" },
      location: body.location,
      workMode: body.workMode as ApplicationResponse["workMode"],
      postingUrl: body.postingUrl,
      source: body.source,
      // Absent means today, which the real handler computes in the account's own
      // timezone. The fake has one clock and no reason to pretend otherwise.
      appliedDate: body.appliedDate ?? new Date().toISOString().slice(0, 10),
      applicationDeadline: body.applicationDeadline,
      cvLabel: body.cvLabel,
      coverLetterLabel: body.coverLetterLabel,
    });

    applications.set(userId, [created, ...(applications.get(userId) ?? [])]);
    send(response, 201, created satisfies ApplicationResponse);
    return;
  }

  if (method === "GET" && path === "/api/v1/applications") {
    const token = bearerOf(request);
    const userId = token === null ? undefined : accessTokens.get(token);

    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    listCalls.set(userId, (listCalls.get(userId) ?? 0) + 1);

    const query = new URL(url, "http://fake-api.test").searchParams;
    const sortBy = query.get("sortBy") ?? "appliedDate";
    const descending = (query.get("sortDirection") ?? "desc") === "desc";
    const stages = query.getAll("stage");
    const campaignId = query.get("campaignId");
    const limit = Number(query.get("limit") ?? 25);
    const cursor = query.get("cursor");

    if (isFailingStageRead(userId, stages)) {
      sendProblem(response, 500, "server.error", "Something went wrong.");
      return;
    }

    let offset = 0;
    if (cursor !== null) {
      const decoded = decodeCursor(cursor);

      // The cursor carries the sort that issued it, exactly as the real one
      // does, so a walk cannot be continued under an order it did not start in.
      if (
        expiredCursors.has(userId) ||
        decoded === null ||
        decoded.sort !== sortTag(sortBy, descending)
      ) {
        expiredCursors.delete(userId);
        sendProblem(
          response,
          422,
          "cursor.sort_mismatch",
          "That cursor was issued for a different order.",
        );
        return;
      }

      offset = decoded.offset;
    }

    const all = (applications.get(userId) ?? [])
      // An absent campaignId is every campaign rather than none: the real API
      // applies the account's default, and a seed that names no campaign belongs
      // to it.
      .filter((application) => campaignId === null || application.campaignId === campaignId)
      .filter((application) => stages.length === 0 || stages.includes(application.stage))
      .sort((a, b) => compareApplications(a, b, sortBy, descending));

    const items = all.slice(offset, offset + limit);
    const next = offset + items.length;

    send(response, 200, {
      items: items.map(toSummary),
      // Null is the only stop signal the client reads, so it has to be null at
      // the end rather than a cursor pointing past the last row.
      nextCursor: next < all.length ? encodeCursor(sortTag(sortBy, descending), next) : null,
    } satisfies ApplicationPage);
    return;
  }

  const transitionMatch = TRANSITION_PATH.exec(path);
  if (method === "POST" && transitionMatch !== null) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    // Recorded before anything can refuse the request, so an armed failure still
    // leaves the key visible to the spec that is about to watch it be re-issued.
    const key = request.headers["idempotency-key"];
    if (typeof key === "string") {
      idempotencyKeys.set(userId, [...(idempotencyKeys.get(userId) ?? []), key]);
    }

    const body = await readJson<{ targetStage: string | null }>(request);
    const target = body?.targetStage ?? "";

    if (isFailing(userId, "transition-in-flight")) {
      // Retry-After is what the client waits before re-issuing the same key.
      response.writeHead(409, { "content-type": "application/problem+json", "retry-after": "1" });
      response.end(
        JSON.stringify({
          type: "https://jobspect.test/problems/idempotency.in_flight",
          title: "Request failed",
          status: 409,
          detail: "That request is already being processed.",
          code: "idempotency.in_flight",
        }),
      );
      return;
    }

    if (isFailing(userId, "transition-unavailable")) {
      sendProblem(response, 503, "idempotency.unavailable", "The idempotency store is down.");
      return;
    }

    const application = (applications.get(userId) ?? []).find(
      (candidate) => candidate.id === transitionMatch[1],
    );

    if (application === undefined) {
      sendProblem(response, 404, "application.not_found", "No application for this account.");
      return;
    }

    // A stage that is not a stage is a different failure from a move that is not
    // allowed, and the two are keyed differently so a client can tell them apart.
    const stage = toStageName(target);
    if (stage === undefined) {
      send(response, 422, {
        type: "https://jobspect.test/problems/validation",
        title: "Request failed",
        status: 422,
        errors: { targetStage: ["The target stage is not a known pipeline stage."] },
      });
      return;
    }

    const kind = transitionKindOf(application.stage, stage);

    if (kind === null || isFailing(userId, "transition-illegal")) {
      sendProblem(
        response,
        422,
        "application.illegal_transition",
        `An application cannot move from ${application.stage} to ${stage}.`,
      );
      return;
    }

    const from = application.stage;
    application.stage = stage;
    application.updatedAt = new Date().toISOString();

    // The move writes its own line of history, which is what the detail screen
    // has to refetch to stay truthful.
    activity.set(userId, [
      ...(activity.get(userId) ?? []),
      {
        applicationId: application.id,
        entry: anActivityEntry({
          kind: "StageChanged",
          fromStage: from,
          toStage: stage,
          transitionKind: kind,
        }),
      },
    ]);

    send(response, 200, application satisfies ApplicationResponse);
    return;
  }

  const activityMatch = ACTIVITY_PATH.exec(path);
  if (activityMatch !== null && (method === "GET" || method === "POST")) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    const applicationId = activityMatch[1] ?? "";

    if (method === "POST") {
      // Recorded before anything can refuse the request, so an armed failure
      // still leaves the key visible to the spec that is about to retry it.
      const key = request.headers["idempotency-key"];
      if (typeof key === "string") {
        idempotencyKeys.set(userId, [...(idempotencyKeys.get(userId) ?? []), key]);
      }

      if (isFailing(userId, "add-note")) {
        sendProblem(response, 500, "internal", "The add-note write is armed to fail.");
        return;
      }

      const body = await readJson<{ note: string | null }>(request);
      const note = body?.note ?? "";

      // The same two refusals the real validator makes, keyed to the same field.
      if (note.trim() === "") {
        send(response, 422, {
          type: "https://jobspect.test/problems/validation",
          title: "Request failed",
          status: 422,
          errors: { note: ["A note is required."] },
        });
        return;
      }

      if (note.length > NOTE_MAX_LENGTH) {
        send(response, 422, {
          type: "https://jobspect.test/problems/validation",
          title: "Request failed",
          status: 422,
          errors: { note: [`The note must be ${String(NOTE_MAX_LENGTH)} characters or fewer.`] },
        });
        return;
      }

      // Trimmed by the handler, so a note stored with its whitespace would be a
      // shape no client will ever read back.
      const entry = anActivityEntry({ kind: "Note", note: note.trim() });
      activity.set(userId, [...(activity.get(userId) ?? []), { applicationId, entry }]);

      send(response, 201, entry satisfies ActivityEntryResponse);
      return;
    }

    // Spent on the first refusal rather than left armed, which is what makes it
    // usable around a move: one read fails and the next succeeds, so a spec can
    // arm it after the page has rendered and ask what the screen does when the
    // history is read once and lost.
    if (isFailing(userId, "activity")) {
      sendProblem(response, 500, "internal", "The activity read is armed to fail.");
      return;
    }

    const query = new URL(url, "http://fake-api.test").searchParams;
    const limit = Number(query.get("limit") ?? 25);
    const cursor = query.get("cursor");

    let offset = 0;
    if (cursor !== null) {
      const decoded = decodeCursor(cursor);
      if (decoded === null) {
        send(response, 422, {
          type: "https://jobspect.test/problems/validation",
          title: "Request failed",
          status: 422,
          errors: { cursor: ["The cursor could not be read."] },
        });
        return;
      }

      offset = decoded.offset;
    }

    // Newest first, which is the order a history is read in and the reason a new
    // entry never disturbs a cursor already issued.
    const all = [...(activity.get(userId) ?? [])]
      .filter((stored) => stored.applicationId === applicationId)
      .map((stored) => stored.entry)
      .sort((a, b) =>
        a.occurredAt === b.occurredAt
          ? a.id < b.id
            ? 1
            : -1
          : a.occurredAt < b.occurredAt
            ? 1
            : -1,
      );

    const items = all.slice(offset, offset + limit);
    const next = offset + items.length;

    send(response, 200, {
      items,
      nextCursor: next < all.length ? encodeCursor("activity", next) : null,
    } satisfies ActivityPage);
    return;
  }

  const interviewsMatch = INTERVIEWS_PATH.exec(path);
  if (method === "GET" && interviewsMatch !== null) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    if (isFailing(userId, "interviews")) {
      sendProblem(response, 500, "internal", "The interviews read is armed to fail.");
      return;
    }

    // Ascending by scheduled instant, as the real handler orders them. A panel
    // that had to sort what it was given would be papering over the endpoint.
    const items = (interviews.get(userId) ?? [])
      .filter((interview) => interview.applicationId === interviewsMatch[1])
      .sort((a, b) => (a.scheduledAt < b.scheduledAt ? -1 : 1));

    send(response, 200, { items, nextCursor: null } satisfies InterviewPage);
    return;
  }

  if (method === "POST" && interviewsMatch !== null) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    // Recorded before the arming is checked, so a spec watching a retry sees the
    // key of the attempt that failed as well as the one that worked.
    const key = request.headers["idempotency-key"];
    if (typeof key === "string") {
      idempotencyKeys.set(userId, [...(idempotencyKeys.get(userId) ?? []), key]);
    }

    if (isFailing(userId, "create-interview")) {
      sendProblem(response, 500, "internal", "The interview write is armed to fail.");
      return;
    }

    const applicationId = interviewsMatch[1] ?? "";
    const body = await readJson<CreateInterviewRequest>(request);

    if (body === null) {
      sendProblem(response, 422, "interview.invalid", "A body is required.");
      return;
    }

    lastInterviewWrites.set(userId, body);

    // The parent has to be the caller's own or the whole route is absent, which
    // is what makes a round on somebody else's application a 404 rather than a
    // refusal naming it.
    if (!(applications.get(userId) ?? []).some((application) => application.id === applicationId)) {
      sendProblem(response, 404, "application.not_found", "No such application for this account.");
      return;
    }

    const errors = refuseInterviewWrite(body, undefined);
    if (errors !== null) {
      sendValidationProblem(response, errors);
      return;
    }

    const created = anInterview(applicationId, {
      scheduledAt: body.scheduledAt ?? "",
      type: body.type as InterviewResponse["type"],
      format: body.format as InterviewResponse["format"],
      // Always pending. The request has no outcome and the real handler writes
      // this one rather than reading it.
      outcome: "Pending",
      notes: body.notes,
    });

    interviews.set(userId, [...(interviews.get(userId) ?? []), created]);
    send(response, 201, created satisfies InterviewResponse);
    return;
  }

  const interviewMatch = INTERVIEW_PATH.exec(path);
  if (method === "PUT" && interviewMatch !== null) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    const body = await readJson<UpdateInterviewRequest>(request);
    if (body === null) {
      sendProblem(response, 422, "interview.invalid", "A body is required.");
      return;
    }

    // Recorded before any refusal, so a spec can read what went out even when the
    // answer was no.
    lastInterviewWrites.set(userId, body);

    const stored = (interviews.get(userId) ?? []).find(
      (interview) =>
        interview.id === interviewMatch[2] && interview.applicationId === interviewMatch[1],
    );

    if (stored === undefined) {
      sendProblem(response, 404, "interview.not_found", "No such interview for this account.");
      return;
    }

    const errors = refuseInterviewWrite(body, body.outcome);
    if (errors !== null) {
      sendValidationProblem(response, errors);
      return;
    }

    // Every field, because that is what a replace means - and the notes are the
    // one a client is most likely to leave out.
    stored.scheduledAt = body.scheduledAt ?? "";
    stored.type = body.type as InterviewResponse["type"];
    stored.format = body.format as InterviewResponse["format"];
    stored.outcome = body.outcome as InterviewResponse["outcome"];
    stored.notes = body.notes;
    stored.updatedAt = new Date().toISOString();

    send(response, 200, stored satisfies InterviewResponse);
    return;
  }

  if (method === "POST" && path === "/__test/plan") {
    const body = await readJson<{ email: string; tier: PlanTier }>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    if (body === null || account === undefined) {
      sendProblem(response, 404, "account.not_found", "Seed an account before its plan.");
      return;
    }

    plans.set(account.userId, body.tier);
    send(response, 204, undefined);
    return;
  }

  // What the client actually put on the wire, which is the only place the
  // full-replace rule can be checked end to end.
  if (method === "GET" && path === "/__test/last-update") {
    const email = new URL(url, "http://fake-api.test").searchParams.get("email") ?? "";
    const account = accounts.get(accountKey(email));

    send(response, 200, {
      body: account === undefined ? null : (lastUpdates.get(account.userId) ?? null),
    });
    return;
  }

  if (method === "GET" && path === "/__test/last-contact-write") {
    const email = new URL(url, "http://fake-api.test").searchParams.get("email") ?? "";
    const account = accounts.get(accountKey(email));

    send(response, 200, {
      body: account === undefined ? null : (lastContactWrites.get(account.userId) ?? null),
    });
    return;
  }

  if (method === "GET" && path === "/__test/last-interview-write") {
    const email = new URL(url, "http://fake-api.test").searchParams.get("email") ?? "";
    const account = accounts.get(accountKey(email));

    send(response, 200, {
      body: account === undefined ? null : (lastInterviewWrites.get(account.userId) ?? null),
    });
    return;
  }

  if (method === "GET" && path === "/api/v1/billing/plan") {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    send(response, 200, {
      tier: plans.get(userId) ?? "Free",
      updatedAt: null,
    } satisfies PlanStatusResponse);
    return;
  }

  const applicationMatch = APPLICATION_PATH.exec(path);
  if (method === "PUT" && applicationMatch !== null) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    const stored = (applications.get(userId) ?? []).find(
      (application) => application.id === applicationMatch[1],
    );

    if (stored === undefined) {
      sendProblem(response, 404, "application.not_found", "No such application for this account.");
      return;
    }

    const body = await readJson<UpdateApplicationRequest>(request);
    if (body === null) {
      sendProblem(response, 422, "application.invalid", "A body is required.");
      return;
    }

    // Recorded before any refusal, so a spec can read what went out even when
    // the answer was no.
    lastUpdates.set(userId, body);

    const refusal = refuseUpdate(userId, stored, body);
    if (refusal !== null) {
      refusal(response);
      return;
    }

    applyUpdate(stored, body);
    send(response, 200, stored satisfies ApplicationResponse);
    return;
  }

  if (method === "DELETE" && applicationMatch !== null) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    if (isFailing(userId, "delete-application")) {
      // 503 rather than 404, because the client reads a 404 as success - a
      // refusal has to be one it cannot mistake for the row already being gone.
      // Carries no `code`, which is what a real outage looks like: the status
      // families exist for exactly the failures no endpoint named.
      sendUncodedProblem(response, 503, "The service is unavailable.");
      return;
    }

    const held = applications.get(userId) ?? [];
    const index = held.findIndex((application) => application.id === applicationMatch[1]);

    if (index === -1) {
      // Including the second press of the same button, which the client reads
      // as success - the row is gone, which is what was asked for.
      sendProblem(response, 404, "application.not_found", "No such application for this account.");
      return;
    }

    held.splice(index, 1);
    applications.set(userId, held);
    response.writeHead(204).end();
    return;
  }

  if (method === "GET" && applicationMatch !== null) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    const found = (applications.get(userId) ?? []).find(
      (application) => application.id === applicationMatch[1],
    );

    if (found === undefined) {
      // The same answer another account's application gets, which is the whole
      // point: absent and forbidden are indistinguishable from out here.
      sendProblem(response, 404, "application.not_found", "No such application for this account.");
      return;
    }

    send(response, 200, found satisfies ApplicationResponse);
    return;
  }

  if (method === "GET" && path === "/api/v1/custom-fields") {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    if (isFailing(userId, "custom-fields")) {
      sendProblem(response, 500, "internal", "The custom-fields read is armed to fail.");
      return;
    }

    // A bare array rather than the paged envelope, and ungated: defining a field
    // is the paid capability, reading the definitions back is not.
    send(response, 200, (customFields.get(userId) ?? []) satisfies CustomFieldResponse[]);
    return;
  }

  if (method === "GET" && path === "/api/v1/contacts") {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    if (isFailing(userId, "contacts")) {
      sendProblem(response, 500, "internal", "The contacts read is armed to fail.");
      return;
    }

    const applicationId = new URL(url, "http://fake-api.test").searchParams.get("applicationId");

    const items = (contacts.get(userId) ?? [])
      .filter((contact) => applicationId === null || contact.applicationId === applicationId)
      .sort((a, b) => (a.name < b.name ? -1 : 1));

    send(response, 200, { items, nextCursor: null } satisfies ContactPage);
    return;
  }

  if (method === "POST" && path === "/api/v1/contacts") {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    // Recorded before the arming is checked, so a spec watching a retry sees the
    // key of the attempt that failed as well as the one that worked.
    const key = request.headers["idempotency-key"];
    if (typeof key === "string") {
      idempotencyKeys.set(userId, [...(idempotencyKeys.get(userId) ?? []), key]);
    }

    if (isFailing(userId, "create-contact")) {
      sendProblem(response, 500, "internal", "The contact write is armed to fail.");
      return;
    }

    const body = await readJson<CreateContactRequest>(request);
    if (body === null) {
      sendProblem(response, 422, "contact.invalid", "A body is required.");
      return;
    }

    lastContactWrites.set(userId, body);

    const errors = refuseContactWrite(body);
    if (errors !== null) {
      sendValidationProblem(response, errors);
      return;
    }

    // A link the caller does not own is the contact-scoped refusal rather than a
    // 404: the route is not the application's, so nothing about it is absent.
    if (
      body.applicationId !== null &&
      !(applications.get(userId) ?? []).some((application) => application.id === body.applicationId)
    ) {
      sendProblem(
        response,
        422,
        "contact.unknown_application",
        "That application does not exist for this account.",
      );
      return;
    }

    const created = aContact(body.applicationId ?? "", {
      companyId: body.companyId,
      name: body.name ?? "",
      role: body.role as ContactResponse["role"],
      email: body.email,
      phone: body.phone,
      notes: body.notes,
    });

    contacts.set(userId, [...(contacts.get(userId) ?? []), created]);
    send(response, 201, created satisfies ContactResponse);
    return;
  }

  const contactMatch = CONTACT_PATH.exec(path);
  if (method === "PUT" && contactMatch !== null) {
    const userId = callerId(request);
    if (userId === undefined) {
      response.writeHead(401).end();
      return;
    }

    const body = await readJson<UpdateContactRequest>(request);
    if (body === null) {
      sendProblem(response, 422, "contact.invalid", "A body is required.");
      return;
    }

    // Recorded before any refusal, so a spec can read what went out even when the
    // answer was no.
    lastContactWrites.set(userId, body);

    const stored = (contacts.get(userId) ?? []).find((contact) => contact.id === contactMatch[1]);

    if (stored === undefined) {
      sendProblem(response, 404, "contact.not_found", "No such contact for this account.");
      return;
    }

    const errors = refuseContactWrite(body);
    if (errors !== null) {
      sendValidationProblem(response, errors);
      return;
    }

    // Every field, because that is what a replace means - the two links most of
    // all, since nothing on the screen would look wrong if they were dropped.
    stored.applicationId = body.applicationId;
    stored.companyId = body.companyId;
    stored.name = body.name ?? "";
    stored.role = body.role as ContactResponse["role"];
    stored.email = body.email;
    stored.phone = body.phone;
    stored.notes = body.notes;
    stored.updatedAt = new Date().toISOString();

    send(response, 200, stored satisfies ContactResponse);
    return;
  }

  if (method === "POST" && path === "/api/v1/identity/register") {
    const body = await readJson<RegisterRequest>(request);
    const email = body?.email ?? "";
    const password = body?.password ?? "";

    if (accounts.has(accountKey(email))) {
      sendProblem(
        response,
        409,
        "registration.email_taken",
        "That email address already has an account.",
      );
      return;
    }

    const account = createAccount(email, password, body?.timeZoneId ?? null);
    send(response, 201, issueTokens(account.userId));
    return;
  }

  if (method === "POST" && path === "/api/v1/identity/login") {
    const body = await readJson<LoginRequest>(request);
    const account = accounts.get(accountKey(body?.email ?? ""));

    // One refusal for both halves, as the real handler does: saying which was
    // wrong is how an attacker learns which addresses have accounts.
    if (account === undefined || account.password !== body?.password) {
      sendProblem(response, 401, "auth.invalid_credentials", "The email or password is incorrect.");
      return;
    }

    send(response, 200, issueTokens(account.userId));
    return;
  }

  if (method === "POST" && path === "/api/v1/identity/refresh") {
    const body = await readJson<RefreshRequest>(request);
    const record =
      body?.refreshToken === undefined ? undefined : refreshTokens.get(body.refreshToken ?? "");

    if (record === undefined) {
      sendProblem(response, 401, "refresh_token.invalid", "That refresh token is not usable.");
      return;
    }

    // Presenting a retired token is what the real API reads as a replay, and it
    // answers by revoking the whole family. Modelled because the client's
    // handling of it is the one path where getting this wrong signs a user out
    // everywhere.
    if (record.retired) {
      for (const [token, candidate] of refreshTokens) {
        if (candidate.userId === record.userId) refreshTokens.delete(token);
      }

      sendProblem(
        response,
        401,
        "refresh_token.reuse_detected",
        "That refresh token was already used.",
      );
      return;
    }

    record.retired = true;
    send(response, 200, issueTokens(record.userId));
    return;
  }

  if (method === "POST" && path === "/api/v1/identity/logout") {
    const body = await readJson<LogoutRequest>(request);
    const token = body?.refreshToken ?? "";
    const record = refreshTokens.get(token);

    if (record !== undefined) record.retired = true;

    // 204 whether or not the token was known: signing out is idempotent, and an
    // error here would leave the caller unsure whether to clear its own state.
    send(response, 204, undefined);
    return;
  }

  if (method === "GET" && path === "/api/v1/account") {
    const token = bearerOf(request);
    const userId = token === null ? undefined : accessTokens.get(token);
    const account = userId === undefined ? undefined : accountById(userId);

    if (account === undefined) {
      // Bodyless, which is the shape the client reads as a stale token.
      response.writeHead(401).end();
      return;
    }

    send(response, 200, {
      userId: account.userId,
      email: account.email,
      timeZoneId: account.timeZoneId,
      createdAt: account.createdAt,
    } satisfies AccountResponse);
    return;
  }

  sendProblem(response, 404, "not_found", `The fake API does not serve ${method} ${path}.`);
}

const port = Number(process.env.PORT ?? 3201);

server.listen(port, "127.0.0.1", () => {
  console.log(`Fake API listening on http://127.0.0.1:${String(port)}`);
});
