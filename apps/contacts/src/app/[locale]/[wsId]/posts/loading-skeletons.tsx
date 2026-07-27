import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';

export function PostStatusSummarySkeleton() {
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardContent className="space-y-5 p-4 md:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(12rem,0.7fr)_minmax(0,2.3fr)]">
          <div className="space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-4 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 10 }, (_, index) => (
              <div
                key={`stage-skeleton-${index}`}
                className="space-y-3 rounded-xl border border-border/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="size-8 rounded-lg" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-14" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-border/60 border-t pt-4">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PostsTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-56" />
        <div className="flex gap-2">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        <div className="grid grid-cols-[minmax(10rem,1.1fr)_minmax(8rem,1fr)_repeat(3,minmax(6rem,0.65fr))] gap-3 border-b bg-muted/30 p-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={`heading-${index}`} className="h-4 w-20" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={`row-${index}`}
            className="grid grid-cols-[minmax(10rem,1.1fr)_minmax(8rem,1fr)_repeat(3,minmax(6rem,0.65fr))] items-center gap-3 border-b p-3 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

export function PostPreviewSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b px-4 py-5 sm:px-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={`preview-status-${index}`} className="h-14 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-6 overflow-hidden p-4 sm:p-6">
        <div className="flex gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
