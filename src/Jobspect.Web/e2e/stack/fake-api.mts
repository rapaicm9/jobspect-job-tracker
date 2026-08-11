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
type ApplicationSummaryResponse = components["schemas"]["ApplicationSummaryResponse"];
type CampaignResponse = components["schemas"]["CampaignResponse"];
type ApplicationPage = components["schemas"]["PagedResponseOfApplicationSummaryResponse"];
type RegisterRequest = components["schemas"]["RegisterRequest"];
type LoginRequest = components["schemas"]["LoginRequest"];
type RefreshRequest = components["schemas"]["RefreshRequest"];
type LogoutRequest = components["schemas"]["LogoutRequest"];

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
const applications = new Map<string, ApplicationSummaryResponse[]>();

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

/**
 * Fills in everything a spec did not care to state.
 *
 * A list spec is about columns, so it names the fields it asserts and lets the
 * rest be plausible - which keeps the interesting values visible in the spec
 * rather than buried in a full DTO literal.
 */
function anApplication(seed: Partial<ApplicationSummaryResponse>): ApplicationSummaryResponse {
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
    source: null,
    appliedDate: "2026-08-01",
    applicationDeadline: null,
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
  a: ApplicationSummaryResponse,
  b: ApplicationSummaryResponse,
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
    const body = await readJson<{ email: string; password: string }>(request);

    if (body === null || accounts.has(accountKey(body.email))) {
      sendProblem(response, 409, "registration.email_taken", "That account already exists.");
      return;
    }

    const account = createAccount(body.email, body.password, null);
    send(response, 201, { userId: account.userId });
    return;
  }

  // Seeds a list for an account that already exists, so a spec about the table
  // is not also a spec about creating applications - which has no write endpoint
  // on this client yet anyway.
  if (method === "POST" && path === "/__test/applications") {
    const body = await readJson<{
      email: string;
      applications: Partial<ApplicationSummaryResponse>[];
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
      items,
      // Null is the only stop signal the client reads, so it has to be null at
      // the end rather than a cursor pointing past the last row.
      nextCursor: next < all.length ? encodeCursor(sortTag(sortBy, descending), next) : null,
    } satisfies ApplicationPage);
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
