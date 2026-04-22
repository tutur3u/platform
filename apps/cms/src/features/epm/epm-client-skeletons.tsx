'use client';

import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';

export function PreviewModeSkeleton() {
  return (
    <div className="space-y-5" data-testid="epm-preview-skeleton">
      <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)_auto]">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 w-28 rounded-xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={`preview-card-skeleton-${index}`}
            className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/80"
          >
            <Skeleton className="aspect-[4/5] w-full rounded-none" />
            <div className="space-y-3 p-4">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[86%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EditModeSkeleton() {
  return (
    <div className="space-y-5" data-testid="epm-edit-skeleton">
      <section className="rounded-[1.6rem] border border-border/70 bg-card/95 p-4">
        <div className="grid gap-3 xl:grid-cols-[180px_240px_240px_minmax(0,1fr)_auto]">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardContent className="grid gap-4 p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <Skeleton className="aspect-[4/5] w-full rounded-[1.4rem]" />
            <div className="space-y-4">
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-9 w-3/4 rounded-xl" />
              <Skeleton className="h-4 w-full rounded-lg" />
              <Skeleton className="h-4 w-[88%] rounded-lg" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-20 rounded-[1rem]" />
                <Skeleton className="h-20 rounded-[1rem]" />
                <Skeleton className="h-20 rounded-[1rem]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-24 w-full rounded-[1.2rem]" />
            <Skeleton className="h-24 w-full rounded-[1.2rem]" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
