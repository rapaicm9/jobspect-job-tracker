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

test.describe("a route that means nothing without an account", () => {
  test("sends a visitor with no cookie to sign in", async ({ page }) => {
    await page.goto("/applications");

    await expect(page).toHaveURL(/\/login$/);
  });

  test("fails closed when the session store cannot be reached", async ({ request }) => {
    // A cookie gets past the proxy, which holds no signature and reads no Redis.
    // The page then asks the DAL, and the DAL cannot reach Redis here - no
    // session store runs in this suite. Landing on the login page is the whole
    // point: a process that cannot read a session must refuse to serve one
    // rather than render as though there were none.
    const response = await request.get("/applications", {
      headers: { Cookie: `${SESSION_COOKIE}=not-a-real-session` },
    });

    expect(new URL(response.url()).pathname).toBe("/login");
  });
});
