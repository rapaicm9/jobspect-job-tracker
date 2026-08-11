import { expect, test } from "@playwright/test";

// Everything here runs against a production build, which is the point: the
// policy the suite asserts is the strict one, without the two directives
// development relaxes.
// The forms are the first interactive client components in the product, which
// makes them the first real test of the policy: "a login form that will not
// submit" is precisely the failure this branch landed early to avoid.
const ROUTES = ["/", "/login", "/register"];

const SESSION_COOKIE = "__Host-jobspect.sid";

const REQUIRED_DIRECTIVES = [
  "default-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

function nonceFrom(policy: string): string {
  const match = /'nonce-([^']+)'/.exec(policy);
  expect(match, "the policy carries a nonce").not.toBeNull();
  return match![1];
}

test.describe("the content security policy", () => {
  test("carries every directive the design calls for", async ({ page }) => {
    const response = await page.goto("/");
    const policy = response?.headers()["content-security-policy"];

    expect(policy, "the response carries a policy").toBeTruthy();

    for (const directive of REQUIRED_DIRECTIVES) {
      expect(policy).toContain(directive);
    }

    expect(policy).toContain("'strict-dynamic'");
    // Both are development-only. Seeing either here means the relaxation leaked
    // into a production build, which is the whole policy undone.
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("'unsafe-inline'");
  });

  test("gives every request a different nonce", async ({ page }) => {
    const first = await page.goto("/");
    const second = await page.reload();

    const one = nonceFrom(first?.headers()["content-security-policy"] ?? "");
    const two = nonceFrom(second?.headers()["content-security-policy"] ?? "");

    expect(one).not.toEqual(two);
  });

  test("is applied to the scripts Next emits", async ({ page }) => {
    const response = await page.goto("/");
    const expected = nonceFrom(response?.headers()["content-security-policy"] ?? "");

    // Read the property, never the attribute. Browsers blank the `nonce`
    // attribute on access so a script cannot exfiltrate it by reading the DOM,
    // which means getAttribute returns "" and an assertion against it passes
    // for entirely the wrong reason.
    const nonces = await page
      .locator("script")
      .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));

    expect(nonces.length, "the page emits scripts at all").toBeGreaterThan(0);
    expect(new Set(nonces)).toEqual(new Set([expected]));
  });

  for (const route of ROUTES) {
    test(`${route} loads without violating it`, async ({ page }) => {
      // The assertion that earns this file. A refused script leaves the HTML
      // intact, so the accessibility sweep stays green while the page is inert -
      // the browser's own complaint is the only thing that notices.
      const violations: string[] = [];
      page.on("console", (message) => {
        if (/content security policy/i.test(message.text())) violations.push(message.text());
      });

      await page.goto(route, { waitUntil: "networkidle" });

      expect(violations).toEqual([]);
    });
  }
});

// Driven over HTTP rather than through the browser's cookie jar. Seeding a
// `__Host-` cookie means satisfying the prefix rules before the request that is
// under test, and the response header is the thing this branch actually
// changed - reading it directly says what happened with nothing in between.
test.describe("the session cookie", () => {
  const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

  test("has its expiry re-stamped on the way back", async ({ request }) => {
    const response = await request.get("/", {
      headers: { Cookie: `${SESSION_COOKIE}=not-a-real-session` },
    });

    const setCookie = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value)
      .find((value) => value.startsWith(`${SESSION_COOKIE}=`));

    expect(setCookie, "the response re-sets the session cookie").toBeDefined();
    // The proxy never looks the session up, so an invented value exercises the
    // same path a real one would - and comes back untouched.
    expect(setCookie).toContain("not-a-real-session");
    expect(setCookie).toContain(`Max-Age=${THIRTY_DAYS_SECONDS}`);

    // The `__Host-` prefix is only worth having if these hold. A Domain would
    // void it outright and let a sibling subdomain write this cookie.
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).not.toContain("Domain=");
  });

  test("is left alone when the request carries none", async ({ request }) => {
    const response = await request.get("/");

    const names = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value);

    expect(names.filter((value) => value.startsWith(SESSION_COOKIE))).toEqual([]);
  });
});

// Driven by hand rather than by a <Link>, and that is not a shortcut. A dynamic
// route is only prefetched when it has a loading.tsx to prefetch, and none of
// these do yet - so waiting for the browser to issue one would be waiting for a
// request it has no reason to make. Sending the header states the same thing and
// keeps stating it once the skeletons land.
test.describe("a prefetch", () => {
  const PREFETCH = { "Next-Router-Prefetch": "1", RSC: "1" };

  test("is left alone by the proxy", async ({ request }) => {
    const response = await request.get("/login", { headers: PREFETCH });

    // No policy means the proxy did not run, which is the whole assertion: the
    // matcher has to exclude it, because Next strips these headers from the
    // request before the proxy function could ever read them.
    expect(response.headers()["content-security-policy"]).toBeUndefined();
  });

  test("does not re-stamp the session cookie", async ({ request }) => {
    const response = await request.get("/login", {
      headers: { ...PREFETCH, Cookie: `${SESSION_COOKIE}=not-a-real-session` },
    });

    const setCookie = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value);

    expect(setCookie.filter((value) => value.startsWith(SESSION_COOKIE))).toEqual([]);
  });

  test("is the only thing excluded - the same request without the header is not", async ({
    request,
  }) => {
    // The control. Without it these two would pass just as well against a
    // matcher that had stopped running on anything at all.
    const response = await request.get("/login", {
      headers: { Cookie: `${SESSION_COOKIE}=not-a-real-session` },
    });

    expect(response.headers()["content-security-policy"]).toBeTruthy();
    expect(
      response
        .headersArray()
        .filter((header) => header.name.toLowerCase() === "set-cookie")
        .map((header) => header.value)
        .filter((value) => value.startsWith(SESSION_COOKIE)),
    ).toHaveLength(1);
  });
});

test.describe("a route that means nothing without an account", () => {
  // Every one of them, not a representative. A new screen that forgets its
  // requireSession() call still redirects for a visitor with no cookie, because
  // the proxy catches that case - so a list is what notices the page itself is
  // no longer guarded.
  const GUARDED = ["/applications", "/board", "/analytics", "/reminders", "/settings"];

  // A route with a loading.tsx answers differently, and it is worth knowing why.
  // Next wraps such a page in Suspense and starts streaming the shell at 200
  // before the page has finished - so a redirect thrown after that point cannot
  // be an HTTP 302 and is completed by the client instead. The guarantee is the
  // same, "the user ends up at login", but only a browser can observe it.
  const STREAMS = new Set(["/applications"]);

  for (const path of GUARDED) {
    test(`${path} sends a visitor with no cookie to sign in`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/login$/);
    });

    test(`${path} fails closed when the session store cannot be reached`, async ({
      browser,
      request,
    }) => {
      // A cookie gets past the proxy, which holds no signature and reads no
      // Redis. The page then asks the DAL, and the DAL cannot reach Redis here -
      // no session store runs in this suite. Landing on the login page is the
      // whole point: a process that cannot read a session must refuse to serve
      // one rather than render as though there were none.
      //
      // Sent as a header rather than seeded into the browser, because a __Host-
      // cookie cannot be added through CDP.
      const cookie = `${SESSION_COOKIE}=not-a-real-session`;

      if (!STREAMS.has(path)) {
        const response = await request.get(path, { headers: { Cookie: cookie } });

        expect(new URL(response.url()).pathname).toBe("/login");
        return;
      }

      const context = await browser.newContext({ extraHTTPHeaders: { Cookie: cookie } });
      try {
        const page = await context.newPage();
        await page.goto(path);

        await expect(page).toHaveURL(/\/login$/);
      } finally {
        await context.close();
      }
    });
  }
});
