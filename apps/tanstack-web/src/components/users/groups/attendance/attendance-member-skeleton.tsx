'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';

export function AttendanceMemberSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-foreground/10 bg-foreground/5 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32 self-center" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-16 rounded" />
            <Skeleton className="h-16 rounded" />
            <Skeleton className="h-16 rounded" />
          </div>
        </div>
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full rounded" />
      </div>
    </div>
  );
}
