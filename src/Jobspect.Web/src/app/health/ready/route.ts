import { getRedis } from "@/server/redis";

// A probe must never be cached or prerendered - a response baked at build time
// says the process is alive long after it stopped being so.
export const dynamic = "force-dynamic";

// Ready means "can serve a request from a logged-in user", and without Redis it
// cannot: every session lives there, so an outage makes each one unreadable.
// Answering 200 through that would hand traffic to a process that can only
// bounce it back to the login page.
//
// 200 with a body rather than a bare 204, to match what the .NET hosts answer on
// the same paths. Aspire's health check treats only 200 as healthy unless told
// otherwise, and the proxy that will front all three of these gets configured
// once - so the odd one out would be the one that costs an afternoon.
export async function GET() {
  try {
    await getRedis().ping();
  } catch {
    // No detail in the body. A probe is reachable from wherever the proxy is,
    // and the reason belongs in the logs rather than in an unauthenticated
    // response.
    return new Response("Unhealthy", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });
  }

  return new Response("Healthy", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}
