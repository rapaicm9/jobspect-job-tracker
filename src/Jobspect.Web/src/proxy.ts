import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_COOKIE_ATTRIBUTES,
  SESSION_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/session-cookie";

// Sits beside `app/` rather than at the repository root: with a `src` directory
// Next only picks this file up as a sibling of the route tree, and one placed a
// level up is silently never invoked.
//
// What belongs here is work that has to happen per request and before a route
// renders. Authorization does not: this runs on prefetches too, and a check
// here would be a check the page still has to repeat.

/**
 * The routes that mean nothing without an account.
 *
 * Real paths, not a prefix: `(app)` is a route *group*, and a parenthesised
 * segment contributes nothing to the URL, so there is no `/app` to match on.
 *
 * This is an optimisation and not the check. All it can see is whether a cookie
 * was sent - the session id carries no signature by decision, and reading Redis
 * here would cost a lookup on every prefetch for no security. The page itself
 * calls the DAL, which is what actually decides.
 */
const AUTHENTICATED_PREFIXES = ["/applications", "/board", "/analytics", "/reminders", "/settings"];

function needsAnAccount(pathname: string): boolean {
  return AUTHENTICATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const SECURITY_HEADERS: Record<string, string> = {
  // The API is same-origin through this service, so no page has a reason to be
  // framed or to leak a full URL cross-origin. Paths carry application ids.
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
};

/**
 * Two directives are relaxed in development and only there.
 *
 * React uses `eval` to reconstruct server-side stack traces in the browser, so
 * without `'unsafe-eval'` a development error is unreadable. Turbopack injects
 * stylesheets as inline tags it does not nonce, so without `'unsafe-inline'` on
 * `style-src` the development server renders unstyled. Neither is needed in a
 * production build, and the Playwright suite runs against one - so what the
 * tests assert is the strict policy, not this.
 */
function contentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`;
  const styleSrc = isDevelopment ? "'self' 'unsafe-inline'" : `'self' 'nonce-${nonce}'`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const sid = request.cookies.get(SESSION_COOKIE)?.value;

  // Saves rendering a page that is only going to redirect itself. Nothing is
  // authorized here - a request that gets past this still meets `requireSession`
  // on the other side, which is the check that counts.
  if (sid === undefined && needsAnAccount(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Web Crypto rather than `node:crypto`: Next describes the proxy as something
  // it may run ahead of the application rather than inside it, and this file has
  // no other reason to assume which runtime that is.
  const nonce = crypto.randomUUID();
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  // The policy goes on the request as well as the response, and that is not
  // duplication. Next reads the incoming `Content-Security-Policy` during
  // render, pulls the nonce out of it, and stamps it onto the framework scripts,
  // the page bundles and its own inline tags. Set it only on the response and
  // every one of those ships without a nonce for `strict-dynamic` to accept.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }

  response.headers.set("Content-Security-Policy", policy);

  // Re-stamp the session cookie so its life tracks activity rather than the one
  // login it was written at. The refresh token's expiry slides on every
  // rotation, and a Server Component cannot write a cookie - this is the layer
  // that owns response headers, and it needs to know nothing about the session
  // to do it. A cookie outliving its record costs nothing: the lookup misses and
  // the user signs in.
  //
  // Safe on a Server Action's request too, which this also runs on: response
  // cookies are keyed by name and the action writes after this, so a sign-out
  // clearing the cookie is never undone by the re-stamp.
  if (sid !== undefined) {
    response.cookies.set(SESSION_COOKIE, sid, {
      ...SESSION_COOKIE_ATTRIBUTES,
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}

export const config = {
  // Everything except the paths that never render a document. Static assets and
  // the image optimizer are served thousands of times per session and gain
  // nothing from a header pass; the health probes answer text/plain and are
  // polled by a container runtime that does not care.
  //
  // Prefetches are excluded on top of that. A <Link> in the shell fetches every
  // destination the user can see, and none of that work needs a nonce, a
  // security header on a payload that is not a document, or a cookie re-stamped
  // by a request the user did not make. The redirect it also skips was never the
  // check - the page's own requireSession() is.
  //
  // It has to be expressed here rather than as an early return, because Next
  // strips `rsc`, `next-router-state-tree` and `next-router-prefetch` from the
  // request inside a proxy on purpose, so that an RSC request cannot be handled
  // differently from the HTML one. Reading the header in the function always
  // finds nothing; the matcher is evaluated before the stripping.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|health/|favicon.ico|.*\\.woff2$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
