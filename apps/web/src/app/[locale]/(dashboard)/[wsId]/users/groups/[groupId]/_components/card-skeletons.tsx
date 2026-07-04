import { Skeleton } from '@tuturuuu/ui/skeleton';

/** Skeleton for a generic section card (header chip + title + body rows). */
function SectionCardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm">
      <header className="flex items-center gap-3 border-border/40 border-b bg-foreground/[0.015] px-5 py-4">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </header>
      <div className="flex flex-col gap-3 p-5">{children}</div>
    </section>
  );
}

function MemberRowSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function MembersCardSkeleton() {
  return (
    <SectionCardShell>
      {Array.from({ length: 5 }, (_, i) => (
        <MemberRowSkeleton key={`member-skel-${i}`} />
      ))}
    </SectionCardShell>
  );
}

export function ScheduleCardSkeleton() {
  return (
    <SectionCardShell>
      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {Array.from({ length: 42 }, (_, i) => (
          <Skeleton
            key={`sched-skel-${i}`}
            className="aspect-square w-full rounded"
          />
        ))}
      </div>
    </SectionCardShell>
  );
}

function ListRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
      <div className="flex flex-1 items-center gap-3">
        <Skeleton className="h-5 w-5 rounded" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <Skeleton className="h-7 w-7 rounded" />
    </div>
  );
}

export function ListCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SectionCardShell>
      {Array.from({ length: rows }, (_, i) => (
        <ListRowSkeleton key={`list-skel-${i}`} />
      ))}
    </SectionCardShell>
  );
}

/** Full overview grid skeleton for route-level loading.tsx. */
export function GroupOverviewSkeleton() {
  return (
    <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-2">
      <MembersCardSkeleton />
      <ScheduleCardSkeleton />
      <ListCardSkeleton rows={3} />
      <ListCardSkeleton rows={2} />
      <ListCardSkeleton rows={3} />
    </div>
  );
}
