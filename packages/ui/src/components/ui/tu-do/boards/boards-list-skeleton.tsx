import { Skeleton } from '@tuturuuu/ui/skeleton';

/**
 * Skeleton placeholder for the boards list page.
 * Mirrors the layout of EnhancedBoardsView: filter bar, tab bar, and a grid of board cards.
 */
export function BoardsListSkeleton() {
  return (
    <div className="space-y-6">
      {/* Filter bar skeleton */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          {/* Search input */}
          <div className="flex-1">
            <Skeleton className="mb-1 h-4 w-20" />
            <Skeleton className="mt-1 h-9 w-full" />
          </div>

          {/* Status filter + sort + buttons */}
          <div className="grid grid-cols-2 gap-3 lg:flex lg:items-end">
            <div className="min-w-40">
              <Skeleton className="mb-1 h-4 w-16" />
              <Skeleton className="mt-1 h-9 w-full" />
            </div>
            <div className="min-w-40">
              <Skeleton className="mb-1 h-4 w-14" />
              <Skeleton className="mt-1 h-9 w-full" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-16 rounded-md" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar skeleton */}
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>

      {/* Board cards grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-5 w-32" />
                </div>
                <Skeleton className="mt-2 h-4 w-40" />
              </div>
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
