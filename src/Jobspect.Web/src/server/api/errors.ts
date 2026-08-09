import "server-only";

import type { Entitlement } from "./enums";

// Three body shapes arrive on the wire. `code` is absent on validation problems,
// which key their messages to fields instead, and absent again on the framework's
// own refusals, which carry no body at all.

export interface ProblemBody {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  traceId?: string;
}

export interface ValidationProblemBody extends ProblemBody {
  /** A field carries several messages, not one. Forms render a list per field. */
  errors: Record<string, string[]>;
}

/**
 * Every code the API can send, swept from the backend's error definitions. The
 * catalogue is UI policy rather than contract: the document describes an
 * endpoint's shape, never its subject, so statuses are a floor and this is the
 * branch key.
 */
export const ERROR_CODES = [
  "account.export_not_entitled",
  "account.not_found",
  "account.update_failed",
  "analytics.chart_not_found",
  "analytics.chart_unavailable",
  "analytics.full_analytics_not_entitled",
  "analytics.weekly_goal_not_entitled",
  "application.illegal_transition",
  "application.no_default_campaign",
  "application.not_found",
  "application.offer_deadline_requires_offer",
  "application.unknown_campaign",
  "application.unknown_company",
  "auth.invalid_credentials",
  "auth.invalid_token",
  "auth.logout_all_failed",
  "auth.user_not_found",
  "billing.payment_failed",
  "billing.plan_not_found",
  "campaign.default_not_deletable",
  "campaign.limit_reached",
  "campaign.name_taken",
  "campaign.not_entitled",
  "campaign.not_found",
  "contact.not_found",
  "contact.unknown_application",
  "contact.unknown_company",
  "cursor.sort_mismatch",
  "custom_field.archived_field",
  "custom_field.definitions_not_entitled",
  "custom_field.label_taken",
  "custom_field.limit_reached",
  "custom_field.not_entitled",
  "custom_field.not_found",
  "custom_field.not_sortable",
  "custom_field.options_invalid",
  "custom_field.query_not_entitled",
  "custom_field.unknown_field",
  "custom_field.unknown_option",
  "custom_field.value_invalid",
  "idempotency.in_flight",
  "idempotency.key_invalid",
  "idempotency.key_reused",
  "idempotency.unavailable",
  "interview.not_found",
  "refresh_token.expired",
  "refresh_token.invalid",
  "refresh_token.reuse_detected",
  "refresh_token.user_not_found",
  "registration.email_taken",
  "registration.invalid",
  "reminder.not_found",
  "reminder_rule.not_entitled",
  "reminder_rule.not_found",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * What a failure means to the UI. Features switch on `kind`; §12's telemetry
 * counts by it, so a rise in `entitlement` means a gate disagrees with the
 * server and a rise in `cursor-reset` means a list changed its sort.
 */
export type ApiFailure =
  /** Field-keyed messages. Render a list per field, never a single string. */
  | { kind: "validation"; fieldErrors: Record<string, string[]>; problem: ProblemBody }
  /** Absent, not forbidden. Never render "you do not have permission" for this. */
  | { kind: "not-found"; code?: ErrorCode; problem: ProblemBody }
  /** A named field on the request is wrong. Attach the message to that field. */
  | { kind: "field-error"; code: ErrorCode; field: string; problem: ProblemBody }
  /** Wrong as a whole, with no field to blame. Show `detail` above the form. */
  | { kind: "form-error"; code: ErrorCode; problem: ProblemBody }
  | { kind: "conflict"; code: ErrorCode; problem: ProblemBody }
  /** Cap on a Free or Pro plan. Not an entitlement, and the wording differs. */
  | { kind: "limit-reached"; code: ErrorCode; problem: ProblemBody }
  | { kind: "entitlement"; code: ErrorCode; entitlement: Entitlement; problem: ProblemBody }
  /** The pipeline refused the move. `detail` names both stages; show it. */
  | { kind: "illegal-transition"; problem: ProblemBody }
  /** Drop the cursor and refetch from the top. The user sees a refresh. */
  | { kind: "cursor-reset"; problem: ProblemBody }
  /** Form-level, never field-level: do not reveal which half was wrong. */
  | { kind: "credentials"; problem: ProblemBody }
  /** A bodyless 401. The token is missing or expired, so refresh and retry. */
  | { kind: "token-stale" }
  /** The session cannot be recovered by refreshing. Destroy it and redirect. */
  | { kind: "session-destroyed"; code: ErrorCode; familyRevoked: boolean; problem: ProblemBody }
  | { kind: "idempotency-in-flight"; retryAfterSeconds: number | null; problem: ProblemBody }
  /** A key was reused for a different body, or malformed. Our bug, not theirs. */
  | { kind: "client-bug"; code: ErrorCode; problem: ProblemBody }
  /** Degrade one panel, never the page. */
  | { kind: "chart-unavailable"; problem: ProblemBody }
  | {
      kind: "unavailable";
      code?: ErrorCode;
      retryAfterSeconds: number | null;
      problem: ProblemBody;
    }
  /** The server broke. Nothing the user can fix and no field to attach it to. */
  | { kind: "server-fault"; code?: ErrorCode; problem: ProblemBody }
  | { kind: "rate-limited"; retryAfterSeconds: number | null; problem: ProblemBody }
  /** The request never completed: DNS, connection refused, abort, timeout. */
  | { kind: "network"; cause: unknown }
  /** A status or code this build does not know. Log it; never guess at it. */
  | { kind: "unknown"; status: number; code?: string; problem: ProblemBody };

type Behaviour =
  | { kind: "not-found" }
  | { kind: "field-error"; field: string }
  | { kind: "form-error" }
  | { kind: "conflict" }
  | { kind: "limit-reached" }
  | { kind: "entitlement"; entitlement: Entitlement }
  | { kind: "illegal-transition" }
  | { kind: "cursor-reset" }
  | { kind: "credentials" }
  | { kind: "session-destroyed"; familyRevoked: boolean }
  | { kind: "idempotency-in-flight" }
  | { kind: "client-bug" }
  | { kind: "chart-unavailable" }
  | { kind: "unavailable" }
  | { kind: "server-fault" };

/**
 * The whole catalogue, one entry per code. Exhaustive by type: adding a member
 * to ERROR_CODES without deciding what the UI does with it stops compiling.
 */
export const CODE_BEHAVIOUR: Record<ErrorCode, Behaviour> = {
  "account.not_found": { kind: "not-found" },
  "analytics.chart_not_found": { kind: "not-found" },
  "application.not_found": { kind: "not-found" },
  "billing.plan_not_found": { kind: "not-found" },
  "campaign.not_found": { kind: "not-found" },
  "contact.not_found": { kind: "not-found" },
  "custom_field.not_found": { kind: "not-found" },
  "interview.not_found": { kind: "not-found" },
  "reminder.not_found": { kind: "not-found" },
  "reminder_rule.not_found": { kind: "not-found" },

  "application.unknown_company": { kind: "field-error", field: "companyName" },
  "application.unknown_campaign": { kind: "field-error", field: "campaignId" },
  "contact.unknown_application": { kind: "field-error", field: "applicationId" },
  "contact.unknown_company": { kind: "field-error", field: "companyId" },
  "application.offer_deadline_requires_offer": {
    kind: "field-error",
    field: "offerDecisionDeadline",
  },

  "custom_field.value_invalid": { kind: "field-error", field: "customFieldValues" },
  "custom_field.unknown_option": { kind: "field-error", field: "customFieldValues" },
  "custom_field.unknown_field": { kind: "field-error", field: "customFieldValues" },
  "custom_field.archived_field": { kind: "field-error", field: "customFieldValues" },
  "custom_field.options_invalid": { kind: "field-error", field: "options" },
  // The definition's type cannot be sorted on. Drop the sort option rather than
  // attaching a message to a field the user is not looking at.
  "custom_field.not_sortable": { kind: "field-error", field: "sort" },

  // ASP.NET Identity's own validators disagreeing - password policy or email
  // shape - joined into `detail`. There is no field key, so it reads as a
  // form-level message.
  "registration.invalid": { kind: "form-error" },

  "cursor.sort_mismatch": { kind: "cursor-reset" },
  "application.illegal_transition": { kind: "illegal-transition" },

  "custom_field.label_taken": { kind: "conflict" },
  "campaign.name_taken": { kind: "conflict" },
  "registration.email_taken": { kind: "conflict" },
  "campaign.default_not_deletable": { kind: "conflict" },

  "custom_field.limit_reached": { kind: "limit-reached" },
  "campaign.limit_reached": { kind: "limit-reached" },

  "account.export_not_entitled": { kind: "entitlement", entitlement: "Export" },
  "analytics.full_analytics_not_entitled": { kind: "entitlement", entitlement: "FullAnalytics" },
  "analytics.weekly_goal_not_entitled": { kind: "entitlement", entitlement: "FullAnalytics" },
  "campaign.not_entitled": { kind: "entitlement", entitlement: "MultipleCampaigns" },
  "custom_field.not_entitled": { kind: "entitlement", entitlement: "CustomFields" },
  "custom_field.definitions_not_entitled": { kind: "entitlement", entitlement: "CustomFields" },
  "custom_field.query_not_entitled": { kind: "entitlement", entitlement: "CustomFields" },
  "reminder_rule.not_entitled": { kind: "entitlement", entitlement: "FollowUpRules" },

  "auth.invalid_credentials": { kind: "credentials" },

  // Four ways a 401 can carry a body, and none of them is retryable by
  // refreshing. Only a bodyless 401 means "the token aged out".
  "auth.invalid_token": { kind: "session-destroyed", familyRevoked: false },
  "auth.user_not_found": { kind: "session-destroyed", familyRevoked: false },
  "refresh_token.expired": { kind: "session-destroyed", familyRevoked: false },
  "refresh_token.invalid": { kind: "session-destroyed", familyRevoked: false },
  "refresh_token.user_not_found": { kind: "session-destroyed", familyRevoked: false },
  "refresh_token.reuse_detected": { kind: "session-destroyed", familyRevoked: true },

  "idempotency.in_flight": { kind: "idempotency-in-flight" },
  "idempotency.key_reused": { kind: "client-bug" },
  "idempotency.key_invalid": { kind: "client-bug" },
  "idempotency.unavailable": { kind: "unavailable" },

  "analytics.chart_unavailable": { kind: "chart-unavailable" },

  // Server faults. Nothing to attach to a field and nothing the user can do,
  // so these surface as "something went wrong" rather than as validation.
  "account.update_failed": { kind: "server-fault" },
  "auth.logout_all_failed": { kind: "server-fault" },
  "application.no_default_campaign": { kind: "server-fault" },
  "billing.payment_failed": { kind: "server-fault" },
};

const KNOWN_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

export function isErrorCode(value: string | undefined): value is ErrorCode {
  return value !== undefined && KNOWN_CODES.has(value);
}

function isValidationBody(body: ProblemBody | null): body is ValidationProblemBody {
  return (
    body !== null &&
    "errors" in body &&
    typeof (body as ValidationProblemBody).errors === "object" &&
    (body as ValidationProblemBody).errors !== null
  );
}

function retryAfterSeconds(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (raw === null) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Maps a failed response onto the union the UI branches on.
 *
 * Order is deliberate. The bodyless 401 is checked before anything reads the
 * body, because it is the most frequent failure the BFF sees and the only one
 * that refreshing fixes. The two shapes of the transition endpoint's 422 are
 * told apart by which member is present, never by status: an unknown stage
 * arrives field-keyed with no code and is our bug, an illegal move arrives with
 * a code and is a fact about the pipeline worth showing.
 */
export function classify(
  status: number,
  body: ProblemBody | ValidationProblemBody | null,
  headers: Headers = new Headers(),
): ApiFailure {
  if (status === 401 && (body === null || body.code === undefined)) {
    return { kind: "token-stale" };
  }

  const problem: ProblemBody = body ?? { status };

  if (isValidationBody(body)) {
    return { kind: "validation", fieldErrors: body.errors, problem };
  }

  if (status === 429) {
    return { kind: "rate-limited", retryAfterSeconds: retryAfterSeconds(headers), problem };
  }

  const code = problem.code;

  if (isErrorCode(code)) {
    const behaviour = CODE_BEHAVIOUR[code];

    switch (behaviour.kind) {
      case "not-found":
        return { kind: "not-found", code, problem };
      case "field-error":
        return { kind: "field-error", code, field: behaviour.field, problem };
      case "form-error":
        return { kind: "form-error", code, problem };
      case "conflict":
        return { kind: "conflict", code, problem };
      case "limit-reached":
        return { kind: "limit-reached", code, problem };
      case "entitlement":
        return { kind: "entitlement", code, entitlement: behaviour.entitlement, problem };
      case "illegal-transition":
        return { kind: "illegal-transition", problem };
      case "cursor-reset":
        return { kind: "cursor-reset", problem };
      case "credentials":
        return { kind: "credentials", problem };
      case "session-destroyed":
        return {
          kind: "session-destroyed",
          code,
          familyRevoked: behaviour.familyRevoked,
          problem,
        };
      case "idempotency-in-flight":
        return {
          kind: "idempotency-in-flight",
          retryAfterSeconds: retryAfterSeconds(headers),
          problem,
        };
      case "client-bug":
        return { kind: "client-bug", code, problem };
      case "chart-unavailable":
        return { kind: "chart-unavailable", problem };
      case "unavailable":
        return {
          kind: "unavailable",
          code,
          retryAfterSeconds: retryAfterSeconds(headers),
          problem,
        };
      case "server-fault":
        return { kind: "server-fault", code, problem };
    }
  }

  // A code this build has not seen, or none at all. Fall back to the status
  // family rather than guessing, so a new backend code degrades instead of
  // being silently mapped onto the wrong behaviour.
  if (status === 404) return { kind: "not-found", problem };
  if (status === 503) {
    return { kind: "unavailable", retryAfterSeconds: retryAfterSeconds(headers), problem };
  }
  if (status >= 500) return { kind: "server-fault", problem };

  return { kind: "unknown", status, code, problem };
}
