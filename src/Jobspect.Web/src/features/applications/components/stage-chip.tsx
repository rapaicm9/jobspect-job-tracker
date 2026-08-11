import { cn } from "@/lib/utils";
import type { Stage, UnknownStage } from "@/server/api/enums";

/**
 * Full class strings rather than a template, because Tailwind reads the source
 * for literals and `bg-stage-${stage}-surface` produces nothing at all.
 *
 * Two tokens each, and they exist because no single value cleared both the
 * non-text and the text contrast floor: the surface is what the chip sits on and
 * the foreground is what survives on top of it.
 */
const TREATMENT: Record<Stage | UnknownStage, string> = {
  Applied: "bg-stage-applied-surface text-stage-applied-foreground",
  Screening: "bg-stage-screening-surface text-stage-screening-foreground",
  Interview: "bg-stage-interview-surface text-stage-interview-foreground",
  Offer: "bg-stage-offer-surface text-stage-offer-foreground",
  Accepted: "bg-outcome-accepted-surface text-outcome-accepted-foreground",
  Rejected: "bg-outcome-rejected-surface text-outcome-rejected-foreground",
  Withdrawn: "bg-outcome-withdrawn-surface text-outcome-withdrawn-foreground",
  Ghosted: "bg-outcome-ghosted-surface text-outcome-ghosted-foreground",
  // A stage this build does not know still gets a chip. Neutral rather than
  // alarming: an unfamiliar value is a contract that moved, not a problem with
  // the application it belongs to.
  Unknown: "bg-muted text-muted-foreground",
};

/**
 * The chip always carries its name. Colour is the fast read for someone who can
 * use it and never the only one - eight stages cannot be told apart by hue by
 * anyone, and four of them are outcomes on a scale with no order.
 */
export function StageChip({ stage }: { stage: Stage | UnknownStage }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-4xl px-2 text-xs font-medium whitespace-nowrap",
        TREATMENT[stage],
      )}
    >
      {stage}
    </span>
  );
}
