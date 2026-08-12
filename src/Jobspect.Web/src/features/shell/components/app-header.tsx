import Link from "next/link";

import { logout } from "@/features/auth";
import { CampaignSwitcher, type Campaign } from "@/features/campaigns";
import { Button } from "@/ui/button";

import { AppNav } from "./app-nav";
import { CommandPalette } from "./command-palette";

export interface AppHeaderProps {
  /** Null when the account could not be read. The header still renders. */
  email: string | null;
  /** Read once by the layout and shared by both consumers below. */
  campaigns: Campaign[];
}

/** The frame every signed-in screen renders inside. */
export function AppHeader({ email, campaigns }: AppHeaderProps) {
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
          {/* The campaign is the context every scoped screen is read through, so
              it sits with the account rather than in any one screen's filters. */}
          <CampaignSwitcher campaigns={campaigns} />

          <CommandPalette campaigns={campaigns} />
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
