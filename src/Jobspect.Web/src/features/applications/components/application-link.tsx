"use client";

// A client component for one reason: the campaign scope lives in the URL, and a
// `<Link>` drops every parameter its href does not state. Reading it through
// nuqs rather than `useSearchParams` also keeps the href current the moment the
// switcher fires, rather than when its navigation commits.
//
// Prefetching is left on, and the detail route's `loading.tsx` is what makes
// that affordable: a link prefetches on entering the viewport, and for a
// dynamically rendered route the prefetch stops at the nearest loading boundary.
// So a page of twenty-five rows fetches twenty-five loading shells, not
// twenty-five renders of a screen that reads four endpoints. Deleting that file
// turns this into the second thing.

import Link from "next/link";

import { useScopedHref } from "@/features/campaigns";

export interface ApplicationLinkProps {
  id: string;
  className?: string;
  children: React.ReactNode;
}

export function ApplicationLink({ id, className, children }: ApplicationLinkProps) {
  const scoped = useScopedHref();

  return (
    <Link href={scoped(`/applications/${id}`)} className={className}>
      {children}
    </Link>
  );
}
