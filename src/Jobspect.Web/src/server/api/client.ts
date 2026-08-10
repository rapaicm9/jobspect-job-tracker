import "server-only";

import createClient, { type Client, type Middleware } from "openapi-fetch";

import { classify, type ApiFailure, type ProblemBody } from "./errors";
import type { paths } from "./schema";

/**
 * Server-to-server over plain HTTP by design. Node does not read the Windows
 * certificate store, so the dev certificate fails here even where it is trusted
 * for a browser, and the deployed topology terminates TLS at the proxy.
 */
export function requireBaseUrl(): string {
  const baseUrl = process.env.JOBSPECT_API_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      "JOBSPECT_API_BASE_URL is not set. The AppHost supplies it; a bare `next dev` will not.",
    );
  }

  return baseUrl;
}

/** Nothing should take this long. Past it the user is staring at a spinner. */
const REQUEST_BUDGET_MS = 10_000;

export type AccessTokenProvider = () => Promise<string | null>;

let provideAccessToken: AccessTokenProvider = async () => null;

/**
 * The seam the session layer fills. Until it does, every call goes out
 * unauthenticated and the API answers with the bodyless 401 that `classify`
 * reports as `token-stale`.
 */
export function setAccessTokenProvider(provider: AccessTokenProvider): void {
  provideAccessToken = provider;
}

/**
 * The endpoints that take no bearer. Skipping them is not tidiness: the refresh
 * call is made *by* the access-token provider, so sending it through the
 * provider again is unbounded recursion. Naming the paths breaks that at the
 * one place it can be seen, and stops a stale token being offered to login.
 */
const ANONYMOUS_PATHS: ReadonlySet<string> = new Set([
  "/api/v1/identity/register",
  "/api/v1/identity/login",
  "/api/v1/identity/refresh",
  // Logout identifies the session by the refresh token in its body, so it needs
  // no bearer. Attaching one would make signing out on an aged token rotate the
  // pair first - a round trip to obtain a credential we are about to discard,
  // taken on the one code path where the family is most likely to be raced.
  "/api/v1/identity/logout",
]);

/** Attach credentials. */
const auth: Middleware = {
  async onRequest({ request, schemaPath }) {
    if (ANONYMOUS_PATHS.has(schemaPath)) return request;

    // A caller that has already put a token on the request knows something this
    // middleware does not - it is how a retry carries the token from a refresh
    // that has just completed, rather than racing a memo it cannot invalidate.
    if (request.headers.has("Authorization")) return request;

    const token = await provideAccessToken();
    if (token !== null) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
};

/** Spend the user's budget. */
const budget: Middleware = {
  onRequest({ request }) {
    // Preserve any caller signal - a cancelled render still has to cancel the
    // call - and let whichever fires first win.
    const timeout = AbortSignal.timeout(REQUEST_BUDGET_MS);
    const signal =
      request.signal instanceof AbortSignal ? AbortSignal.any([request.signal, timeout]) : timeout;

    return new Request(request, { signal });
  },
};

/** Record spans. */
const telemetry: Middleware = {
  onRequest({ request, schemaPath }) {
    requestStarts.set(request, { schemaPath, startedAt: performance.now() });
    return request;
  },
  onResponse({ request, response, schemaPath }) {
    const started = requestStarts.get(request);
    requestStarts.delete(request);

    // The schema path rather than the resolved URL: ids and filter values are
    // the user's data, and a company name in a span attribute is a leak.
    recordCall({
      schemaPath,
      status: response.status,
      durationMs: started ? performance.now() - started.startedAt : null,
    });

    return undefined;
  },
};

const requestStarts = new WeakMap<Request, { schemaPath: string; startedAt: number }>();

export interface ApiCall {
  /** The templated path, never the resolved URL. See the note above. */
  schemaPath: string;
  status: number;
  durationMs: number | null;
}

export type CallRecorder = (call: ApiCall) => void;

let recordCall: CallRecorder = () => {};

/**
 * The seam the observability work fills, in the same shape as the auth one
 * above. Measuring here and exporting later means adding a recorder rather than
 * revisiting every call site - and whatever gets registered still may not read
 * a body, a token or a resolved URL.
 */
export function setCallRecorder(recorder: CallRecorder): void {
  recordCall = recorder;
}

/**
 * A request that never produced a response: DNS, refused connection, the budget
 * above firing. Carried as a value so callers branch on it like any other
 * failure instead of wrapping every call in try/catch.
 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("The request did not complete.", { cause });
    this.name = "NetworkError";
  }
}

/** Translate failures. */
const errors: Middleware = {
  onError({ error }) {
    return new NetworkError(error);
  },
};

let client: Client<paths> | undefined;

function build(): Client<paths> {
  const created = createClient<paths>({
    baseUrl: requireBaseUrl(),
    // Resolve `fetch` per call rather than letting the client capture it at
    // construction. This module is imported long before anything that wraps the
    // global - Next's own instrumentation, MSW in the test suite - and a captured
    // reference silently bypasses all of it.
    fetch: (request) => globalThis.fetch(request),
  });

  // Order matters on the way out: the budget wraps the Request first so the auth
  // header lands on the object that actually gets sent, and telemetry sees the
  // request last, closest to the wire.
  created.use(budget, auth, telemetry, errors);

  return created;
}

/**
 * Built on first use rather than on import.
 *
 * The base URL is deployment configuration, and reading it at module scope made
 * this module unimportable without it - which `next build` hits while collecting
 * page data, so the application could not be built without the runtime
 * environment it was going to be run in. The check has not been softened, only
 * moved: `instrumentation.ts` still makes a missing value fail the server at
 * startup, so nothing reaches a user before it is noticed.
 */
export const api: Client<paths> = new Proxy({} as Client<paths>, {
  get: (_target, property, receiver) => Reflect.get((client ??= build()), property, receiver),
});

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

/**
 * Turns one `openapi-fetch` outcome into the union features branch on.
 *
 * Classification lives here rather than in a middleware because a middleware
 * only sees a `Response`, and reading its body there would consume the stream
 * `openapi-fetch` is about to parse. By this point the body is already parsed,
 * so there is nothing to clone and nothing to read twice.
 */
export function toResult<T>(outcome: {
  data?: T;
  error?: unknown;
  response: Response;
}): ApiResult<T> {
  const { data, error, response } = outcome;

  if (response.ok && data !== undefined) {
    return { ok: true, data };
  }

  const body = isProblemBody(error) ? error : null;
  return { ok: false, failure: classify(response.status, body, response.headers) };
}

/**
 * Wraps a call so a network failure arrives as a value rather than a throw.
 * Everything else - every status the API can answer with - already comes back
 * through `toResult`.
 */
export async function callApi<T>(
  send: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ApiResult<T>> {
  try {
    return toResult(await send());
  } catch (cause) {
    if (cause instanceof NetworkError) {
      return { ok: false, failure: { kind: "network", cause: cause.cause } };
    }
    throw cause;
  }
}

function isProblemBody(value: unknown): value is ProblemBody {
  return typeof value === "object" && value !== null;
}
