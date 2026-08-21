import Link from "next/link";

import { logout } from "@/features/auth";
import { verifySession } from "@/server/dal";
import { Button, buttonVariants } from "@/ui/button";

// The root not-found, which Next renders for a `notFound()` nothing nearer
// caught and for every URL that matches no route at all.
//
// It renders inside the *root* layout rather than the app shell, so it inherits
// no nav, no account menu and no sign-out - which is what made a 404 in the
// signed-in area a trap rather than an inconvenience. The one screen that could
// end a session the app could not serve was the broken screen itself, and
// /login and /register both bounce a live session straight back to it. So the
// escapes are built here, on the page, rather than assumed from a frame that
// never wraps it.
//
// `BrandLink` is deliberately not reused: it is a Client Component reading the
// campaign out of the URL, which needs the nuqs adapter that only the app
// layout provides. Importing it would fail here, in the one place that has to
// keep working.
//
// There is no `metadata` export because Next honours one from `layout` and
// `page` only; the tab keeps the root layout's title. An export here would read
// as though it worked.

/** Which way out to offer. Not the session's state - what the reader can do. */
type Standing = "signed-in" | "signed-out" | "unknown";

async function currentStanding(): Promise<Standing> {
  try {
    const state = await verifySession();

    if (state.status === "active") return "signed-in";

    // `unavailable` does not mean nobody is signed in, it means the store could
    // not be asked. Reporting that as signed-out would hide the sign-out control
    // from the reader most likely to need it.
    return state.status === "unavailable" ? "unknown" : "signed-out";
  } catch {
    // `verifySession` throws when the refresh path cannot reach the API. A page
    // whose whole purpose is to work when something is broken cannot be one of
    // the things that breaks, so an unreadable session is an answer rather than
    // a failure.
    return "unknown";
  }
}

export default async function NotFound() {
  const standing = await currentStanding();
  const signedIn = standing === "signed-in";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
      {/* The wordmark, and not a link: the primary action below already goes
          where a linked one would, and two controls to one place is one more
          thing to read on a screen that exists to be left quickly. */}
      <p className="text-base font-semibold tracking-tight text-foreground">Jobspect</p>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          We could not find that page
        </h1>
        <p className="text-sm text-muted-foreground">
          The link may be out of date, or it may be pointing at something that was never here.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {signedIn ? (
          <>
            <Link href="/applications" className={buttonVariants({ size: "sm" })}>
              Applications
            </Link>
            <Link
              href="/board"
              className="text-sm underline underline-offset-4 hover:text-muted-foreground"
            >
              Board
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              Sign in
            </Link>
            <Link
              href="/"
              className="text-sm underline underline-offset-4 hover:text-muted-foreground"
            >
              Home
            </Link>
          </>
        )}
      </div>

      {standing !== "signed-out" && (
        // Set apart and explained, because a sign-out button on a 404 is a
        // non-sequitur without the sentence above it. This is the escape the
        // page exists for: a session the application cannot serve is one the
        // reader has no other way to end.
        <div className="space-y-3 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            If you keep landing here, signing out and back in will reset the session.
          </p>

          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      )}
    </main>
  );
}
