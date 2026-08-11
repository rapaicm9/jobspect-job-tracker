import Link from "next/link";

import { logout } from "@/features/auth";
import { Button } from "@/ui/button";

import { AppNav } from "./app-nav";

export interface AppHeaderProps {
  /** Null when the account could not be read. The header still renders. */
  email: string | null;
}

/**
 * The frame every signed-in screen renders inside.
 *
 * The campaign switcher belongs between the nav and the account, and arrives
 * with the list it scopes - a switcher over one screen would be a control with
 * nothing to change.
 */
export function AppHeader({ email }: AppHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link
          href="/applications"
          className="text-base font-semibold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Jobspect
        </Link>

        <AppNav />

        <div className="ml-auto flex items-center gap-3">
          {email !== null && (
            // Hidden on narrow screens rather than truncated: an address cut to
            // "mihajlo.rap…" identifies nobody, and the account it names is
            // reachable from Settings either way.
            <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
          )}

          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
