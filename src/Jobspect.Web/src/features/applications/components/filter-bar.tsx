"use client";

import { useQueryStates } from "nuqs";
import { useTransition } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";

import {
  filterParsers,
  SORT_DIRECTIONS,
  SORT_KEYS,
  type SortDirection,
  type SortKey,
} from "../filters";

const SORT_LABEL: Record<SortKey, string> = {
  appliedDate: "Applied",
  applicationDeadline: "Deadline",
};

const DIRECTION_LABEL: Record<SortDirection, string> = {
  desc: "Newest first",
  asc: "Oldest first",
};

export interface FilterBarProps {
  /**
   * Passed in rather than imported: the stage union lives behind `server-only`
   * and this is a Client Component. The page has it and hands it over.
   */
  stages: readonly string[];
}

export function FilterBar({ stages }: FilterBarProps) {
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useQueryStates(filterParsers, {
    // The whole mechanism. nuqs defaults to a client-only URL update, which
    // would change the address bar and leave the server holding the first page
    // it fetched for the old filters. This asks for the RSC tree to re-render.
    shallow: false,
    // Pairs with the above so the bar can say it is working while the server
    // renders the new first page.
    startTransition,
  });

  function toggleStage(stage: string) {
    const selected = filters.stage.includes(stage)
      ? filters.stage.filter((value) => value !== stage)
      : [...filters.stage, stage];

    void setFilters({ stage: selected });
  }

  return (
    <div
      className={cn("flex flex-col gap-3", isPending && "opacity-60")}
      // The list below is being replaced rather than added to, and a screen
      // reader should hear that once it settles rather than per keystroke.
      aria-busy={isPending}
    >
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Filter by stage</legend>
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          Stage
        </span>

        {stages.map((stage) => {
          const selected = filters.stage.includes(stage);

          return (
            <Button
              key={stage}
              type="button"
              size="sm"
              variant={selected ? "secondary" : "ghost"}
              aria-pressed={selected}
              onClick={() => {
                toggleStage(stage);
              }}
            >
              {stage}
            </Button>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Sort</legend>
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          Sort by
        </span>

        {SORT_KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={filters.sortBy === key ? "secondary" : "ghost"}
            aria-pressed={filters.sortBy === key}
            onClick={() => {
              void setFilters({ sortBy: key });
            }}
          >
            {SORT_LABEL[key]}
          </Button>
        ))}

        {SORT_DIRECTIONS.map((direction) => (
          <Button
            key={direction}
            type="button"
            size="sm"
            variant={filters.sortDirection === direction ? "secondary" : "ghost"}
            aria-pressed={filters.sortDirection === direction}
            onClick={() => {
              void setFilters({ sortDirection: direction });
            }}
          >
            {DIRECTION_LABEL[direction]}
          </Button>
        ))}
      </fieldset>
    </div>
  );
}
