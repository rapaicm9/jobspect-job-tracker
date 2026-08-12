import { NuqsAdapter } from "nuqs/adapters/next/app";

import { listCampaigns } from "@/features/campaigns/server";
import { AppHeader } from "@/features/shell";
import { getAccount } from "@/server/dal";

/**
 * The shell, and deliberately not a guard.
 *
 * A layout renders once and then stays put across navigations, so a session
 * check here would pass on the way in and never run again - which is why
 * authorization lives in each page's own `requireSession()` call instead. What
 * this does need is the account, and `getAccount` is memoised for the render
 * pass, so asking for it here costs the page nothing.
 *
 * It tolerates a null account rather than assuming one: a page whose session has
 * gone redirects itself, and until that redirect lands this still has to render.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Both memoised for the render pass, and both read here because the header
  // needs them on every screen. The campaigns call is the one ongoing cost of a
  // global switcher: one small request per authenticated navigation.
  const [account, campaigns] = await Promise.all([getAccount(), listCampaigns()]);

  return (
    // Above the header rather than around the list, which is where it started.
    // A layout never receives searchParams, so the campaign switcher has to read
    // the URL as a client and its provider has to be above it. The Query
    // provider deliberately did not follow: §5 permits three uses and putting it
    // here would make a fourth the easiest thing to write.
    <NuqsAdapter>
      {/* First in the tab order and invisible until it has focus. A header with
          five links in it is a block every keyboard user would otherwise walk
          through on every screen. */}
      <a
        href="#main"
        className="sr-only rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>

      <AppHeader email={account?.email ?? null} campaigns={campaigns} />

      {/* tabIndex -1 so the skip link actually moves focus. A fragment link to a
          non-focusable element scrolls the page and leaves focus in the header,
          which is the failure that makes skip links look like they work. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 outline-none"
      >
        {children}
      </main>
    </NuqsAdapter>
  );
}
