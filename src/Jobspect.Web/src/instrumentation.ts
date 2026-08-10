// Runs once per server instance, before the first request is handled.
//
// Beside `app/` for the same reason as proxy.ts: with a `src` directory this is
// where Next looks, and a copy at the repository root would never run.
//
// The OpenTelemetry registration goes here too, pointed at the collector the
// .NET hosts already report to. Until then this file carries one job: the API
// client holds its access-token provider in a module-level mutable, and "once
// per server start" is exactly what this hook is.

export async function register() {
  // ioredis and node:crypto are unavailable in the edge runtime, and this hook
  // runs in whichever runtimes the app uses. Importing behind the guard keeps
  // them out of a bundle that could not load them.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ setAccessTokenProvider, requireBaseUrl }, { verifySession, UpstreamError }] =
    await Promise.all([import("@/server/api/client"), import("@/server/dal")]);

  // Fail the boot rather than the first request. The API client itself builds
  // lazily so the application can be compiled without deployment configuration,
  // which leaves this as the place that still refuses to start without it.
  requireBaseUrl();

  setAccessTokenProvider(async () => {
    try {
      const state = await verifySession();
      return state.status === "active" ? state.session.accessToken : null;
    } catch (cause) {
      // A failed refresh is worth surfacing: the caller gets an error boundary
      // rather than a request that goes out unauthenticated and fails anyway.
      if (cause instanceof UpstreamError) throw cause;

      // Anything else means there is no request to read a cookie from - a call
      // made from startup code, or from a script. Unauthenticated is correct.
      return null;
    }
  });
}
