import Link from "next/link";

// Its own rather than the framework's, which renders outside this shell - so a
// missing application would drop the nav, the account and sign-out on the way.
//
// The wording is load-bearing. Another user's application answers 404 exactly as
// a deleted one does, on purpose and on both sides of the wire, so this page
// cannot say "you don't have permission" without claiming to know something it
// does not: it is absent, and that is all there is to report.
export default function ApplicationNotFound() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium text-foreground">We could not find that application</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
        It may have been removed, or the link may be pointing at something that was never here.
      </p>

      <Link
        href="/applications"
        className="mt-6 inline-block text-sm underline underline-offset-4 hover:text-muted-foreground"
      >
        Back to all applications
      </Link>
    </div>
  );
}
