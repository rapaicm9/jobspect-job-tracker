"use client";

// A Client Component for one reason: the current destination has to be marked,
// `usePathname` is a client hook, and a layout does not re-render on navigation
// - so a server-rendered nav would keep whichever item was current when the
// shell first rendered.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "../nav-items";

function isCurrent(pathname: string, href: string): boolean {
  // Prefix match so a detail screen keeps its section marked: /applications/{id}
  // is still Applications. The trailing slash stops /analytics matching a future
  // /analytics-something.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary">
      {/* One row at every width. Five labels fit a narrow phone, and the scroll
          is the escape hatch rather than the layout: a drawer for five links
          buys a focus trap and an escape key nobody needed. */}
      <ul className="flex items-center gap-1 overflow-x-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const current = isCurrent(pathname, href);

          return (
            <li key={href}>
              <Link
                href={href}
                // The accessible statement of what the styling says. Without it
                // the current item is a colour, which is not available to a
                // screen reader and not reliable for anyone.
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  "h-(--control-height-md) min-h-(--target-min)",
                  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  current
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
