import Link from "next/link";

import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import type { BoardCard as Card } from "../board";

export interface BoardCardProps {
  card: Card;
  /** The campaign the board is being read through, stamped onto the link. */
  href: string;
}

/**
 * What you scan a board for: who, where, when it went out, and whether anything
 * is about to run out.
 *
 * A plain `<Link>` rather than the list's `ApplicationLink`. That one reads the
 * scope through a hook because a table row has nowhere else to get it; here the
 * page already knows it and hands the finished href down, which keeps this a
 * Server Component.
 */
export function BoardCard({ card, href }: BoardCardProps) {
  const applied = formatDate(card.appliedDate);

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      {/* The role rather than the whole card, matching every other list in the
          product: one link per item, and the link text names where it goes. */}
      <p className="font-medium text-foreground">
        <Link href={href} className="underline-offset-4 hover:underline">
          {card.role}
        </Link>
      </p>

      {card.companyName !== null && (
        <p className="mt-0.5 text-sm text-muted-foreground">{card.companyName}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {applied !== null && (
          <span>
            Applied <time dateTime={card.appliedDate}>{applied}</time>
          </span>
        )}

        {card.deadline !== null && (
          // The words carry it and the colour carries nothing: near and overdue
          // are told apart by what the chip says, not by what shade it is. The
          // design consolidation session that follows this sprint is where
          // emphasis gets chosen against real data and measured.
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-4xl bg-muted px-2 font-medium whitespace-nowrap",
              card.deadline.overdue ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <time dateTime={card.deadline.date}>{card.deadline.label}</time>
          </span>
        )}
      </div>
    </li>
  );
}
