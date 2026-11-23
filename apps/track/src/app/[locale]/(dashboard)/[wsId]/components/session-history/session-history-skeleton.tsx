import { LoadingRegion, Skeleton, SkeletonLine } from '@tuturuuu/ui/skeleton';

/** Placeholder for the session list while the first period loads. */
export function SessionHistorySkeleton({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel} className="space-y-3 py-2">
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          aria-hidden="true"
          className="flex items-center gap-3 rounded-xl border bg-card p-3 md:p-4"
        >
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col">
            <SkeletonLine size="base" barClassName="w-2/5" />
            <SkeletonLine size="xs" barClassName="w-3/5" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0" />
        </div>
      ))}
    </LoadingRegion>
  );
}
