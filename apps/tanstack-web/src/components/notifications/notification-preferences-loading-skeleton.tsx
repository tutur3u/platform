'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';

export function NotificationPreferencesLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton className="h-16 w-full" key={index} />
        ))}
      </div>
    </div>
  );
}
