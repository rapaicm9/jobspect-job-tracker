import { Skeleton } from "@/ui/skeleton";

// Shaped like the screen it stands in for, so the switch is content arriving
// rather than the page rearranging itself around it. It also earns the route its
// partial prefetch: a dynamic route is only prefetched at all once it has one of
// these.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-5 w-56" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-lg lg:col-span-2" />

        <div className="flex flex-col gap-6">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
