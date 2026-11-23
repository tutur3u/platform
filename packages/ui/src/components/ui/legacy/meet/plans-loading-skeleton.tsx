'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';

const ROWS = [0, 1, 2, 3, 4, 5];

/** Placeholder with the geometry of the plans list or grid. */
export function PlansLoadingSkeleton({ view = 'list' }: { view?: string }) {
  if (view === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ROWS.map((row) => (
          <div
            className="space-y-3 rounded-xl border bg-card p-4 shadow-elevation-1 md:p-5"
            key={row}
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-14" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-card">
      {ROWS.map((row) => (
        <div className="space-y-2 px-4 py-3 md:px-5" key={row}>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-5 w-14" />
          </div>
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
