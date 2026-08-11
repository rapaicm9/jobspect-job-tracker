"use client";

// An error boundary has to be a Client Component: React needs a component that
// can hold the error and re-render when the retry resets it.
//
// Scoped to this route rather than the shell, which is the point of putting it
// here - the nav, the account and sign-out stay usable while the list is the
// only thing that failed.

import { Button } from "@/ui/button";

export default function ApplicationsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-border px-6 py-12 text-center">
      <p className="font-medium text-foreground">We could not load your applications</p>
      <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
        Nothing has changed - this is a problem reading them, not a problem with them. Trying again
        usually works.
      </p>

      <Button type="button" onClick={reset} className="mt-6">
        Try again
      </Button>
    </div>
  );
}
