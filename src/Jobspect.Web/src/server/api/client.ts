import "server-only";

import createClient, { type Middleware } from "openapi-fetch";

import { classify, type ApiFailure, type ProblemBody } from "./errors";
import type { paths } from "./schema";

/**
 * Server-to-server over plain HTTP by design. Node does not read the Windows
 * certificate store, so the dev certificate fails here even where it is trusted
 * for a browser, and the deployed topology terminates TLS at the proxy.
 */
const baseUrl = process.env.JOBSPECT_API_BASE_URL;

if (!baseUrl) {
  throw new Error(
    "JOBSPECT_API_BASE_URL is not set. The AppHost supplies it; a bare `next dev` will not.",
  );
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

/** Attach credentials. */
const auth: Middleware = {
  async onRequest({ request }) {
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

export const api = createClient<paths>({
  baseUrl,
  // Resolve `fetch` per call rather than letting the client capture it at
  // construction. This module is imported long before anything that wraps the
  // global - Next's own instrumentation, MSW in the test suite - and a captured
  // reference silently bypasses all of it.
  fetch: (request) => globalThis.fetch(request),
});

// Order matters on the way out: the budget wraps the Request first so the auth
// header lands on the object that actually gets sent, and telemetry sees the
// request last, closest to the wire.
api.use(budget, auth, telemetry, errors);

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
