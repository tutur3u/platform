'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';

// Loading skeleton component for plans
export function PlansLoadingSkeleton({ view = 'grid' }: { view?: string }) {
  if (view === 'list') {
    return (
      <div className="mt-8 w-full max-w-6xl space-y-4">
        {Array.from({ length: 6 }, (_, i) => i).map((index) => (
          <div
            key={`skeleton-${Date.now()}-${index}`}
            className="flex items-center gap-6 rounded-xl border border-foreground/10 bg-background p-6 shadow-sm"
          >
            <Skeleton className="h-16 w-16 rounded-lg" />
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-4 w-2/3" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-8 grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => i).map((index) => (
        <div
          key={`skeleton-${Date.now()}-${index}`}
          className="group rounded-xl border border-foreground/10 bg-background p-6 shadow-sm transition-all duration-300"
        >
          <div className="mb-5 flex w-full items-start justify-between gap-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <Skeleton className="mb-3 h-4 w-full" />
          <Skeleton className="mb-5 h-4 w-2/3" />

          <div className="mb-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-18 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
