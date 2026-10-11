'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import type { ReactNode } from 'react';

/** Keep the mounted editor binding and draft intact while hydration settles. */
export function TaskDialogLoadingShell({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" aria-busy={loading}>
      {loading && (
        <div
          aria-hidden
          className="absolute inset-0 z-10 bg-background"
          data-task-dialog-skeleton
        >
          <div className="px-4 pt-4 pb-2 md:px-8">
            <Skeleton className="h-[1.875rem] w-3/4" />
          </div>
          <div className="flex min-h-8 items-center gap-2 px-4 py-1 md:px-8">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="min-h-64 space-y-3 px-4 pt-6 md:px-8">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-9/12" />
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      )}
      <div
        className="flex flex-col"
        style={loading ? { visibility: 'hidden' } : undefined}
        inert={loading || undefined}
      >
        {children}
      </div>
    </div>
  );
}
