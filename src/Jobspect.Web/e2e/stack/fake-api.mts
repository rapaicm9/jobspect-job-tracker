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
