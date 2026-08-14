"use client";

// An error boundary has to be a Client Component: React needs one that can hold
// the error and re-render when the retry resets it.
//
// Its own rather than the list's, which would otherwise catch this route and
// tell the reader their applications could not be loaded when it is one of them
// that could not.

import { Button } from "@/ui/button";

export default function ApplicationDetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-border px-6 py-12 text-center">
      <p className="font-medium text-foreground">We could not load this application</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
        Nothing has changed - this is a problem reading it, not a problem with it. Trying again
        usually works.
      </p>

      <Button type="button" onClick={reset} className="mt-6">
        Try again
      </Button>
    </div>
  );
}
