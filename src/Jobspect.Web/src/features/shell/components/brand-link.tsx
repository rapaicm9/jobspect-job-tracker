"use client";

// A Client Component for the same reason the nav beside it is one: it has to
// know the campaign being read through, that lives in the URL, and a layout
// never receives searchParams.

import Link from "next/link";

import { useScopedHref } from "@/features/campaigns";

/** The wordmark, and the way back to the list from anywhere. */
export function BrandLink() {
  const scopedHref = useScopedHref();

  return (
    <Link
      href={scopedHref("/applications")}
      className="text-base font-semibold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      Jobspect
    </Link>
  );
}
