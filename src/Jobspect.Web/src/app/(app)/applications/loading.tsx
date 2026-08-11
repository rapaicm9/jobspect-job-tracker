import { Skeleton } from "@/ui/skeleton";

// Shaped like the screen it stands in for, so the switch is content arriving
// rather than the page rearranging itself around it. It also earns the route its
// partial prefetch: a dynamic route is only prefetched at all once it has one of
// these to prefetch.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-7 w-64" />
      </div>

      <div className="flex flex-col gap-px">
        {/* One per row of a default page, at the comfortable height. Guessing
            low would shift the page down when the rows land. */}
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-(--row-height-comfortable) w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}
