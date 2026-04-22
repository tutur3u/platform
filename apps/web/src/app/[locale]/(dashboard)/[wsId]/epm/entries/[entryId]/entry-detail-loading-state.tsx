'use client';

import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';

export function EntryDetailLoadingState() {
  return (
    <div className="min-h-[calc(100svh-5rem)] space-y-5 pb-8">
      <section className="rounded-[2rem] border border-border/70 bg-card/95 p-5 shadow-none lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-3">
            <Skeleton className="h-6 w-32 rounded-lg" />
            <Skeleton className="h-10 w-80 rounded-xl" />
            <Skeleton className="h-4 w-full max-w-2xl rounded-lg" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-xl" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.14fr)_360px]">
        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.08fr)_280px] lg:p-6">
            <Skeleton className="min-h-[360px] w-full rounded-[1.6rem] lg:min-h-[520px]" />
            <div className="space-y-3">
              <Skeleton className="h-40 w-full rounded-[1.35rem]" />
              <Skeleton className="h-28 w-full rounded-[1.35rem]" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/95 shadow-none">
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-28 w-full rounded-[1.2rem]" />
            <Skeleton className="h-28 w-full rounded-[1.2rem]" />
            <Skeleton className="h-52 w-full rounded-[1.2rem]" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
