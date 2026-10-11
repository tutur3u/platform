'use client';
import { Skeleton } from '@tuturuuu/ui/skeleton';

export function PeriodicReportsLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={`pipeline-${index}`}
              className="space-y-3 rounded-lg border p-3"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 px-3 pb-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={`stage-${index}`} className="h-8 w-20" />
          ))}
        </div>
        <div className="space-y-3 border-t p-3 md:p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </section>
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={`category-${index}`} className="h-8 w-28" />
        ))}
      </div>
      <PeriodicReportsRowsLoading rows={7} />
    </div>
  );
}
export function PeriodicReportsRowsLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={`report-${index}`}
          className="grid gap-3 border-b p-3 last:border-b-0 md:px-4 xl:grid-cols-[minmax(0,1fr)_10rem_12rem] xl:items-center"
        >
          <div className="flex gap-3">
            <Skeleton className="mt-1 size-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
          <div className="flex justify-end gap-1">
            <Skeleton className="size-8" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="size-8" />
          </div>
        </div>
      ))}
    </div>
  );
}
