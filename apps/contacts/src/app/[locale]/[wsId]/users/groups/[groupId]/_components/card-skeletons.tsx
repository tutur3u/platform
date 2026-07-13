import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';

/** Skeleton for a generic section card (header chip + title + body rows). */
function SectionCardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-busy="true"
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm',
        className
      )}
      data-group-section-skeleton
    >
      <header className="flex items-center gap-3 border-border/40 border-b bg-foreground/[0.015] px-4 py-4 sm:px-5">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </header>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">{children}</div>
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
    <SectionCardShell className="min-h-96">
      {Array.from({ length: 5 }, (_, i) => (
        <MemberRowSkeleton key={`member-skel-${i}`} />
      ))}
    </SectionCardShell>
  );
}

export function ScheduleCardSkeleton() {
  return (
    <SectionCardShell className="min-h-96">
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
    <SectionCardShell className="min-h-56">
      {Array.from({ length: rows }, (_, i) => (
        <ListRowSkeleton key={`list-skel-${i}`} />
      ))}
    </SectionCardShell>
  );
}

export function AuditLogCardSkeleton() {
  return (
    <SectionCardShell className="min-h-72 lg:col-span-2">
      <div className="grid grid-cols-4 gap-3 border-border/50 border-b pb-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={`audit-header-${index}`} className="h-3 w-20" />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={`audit-row-${index}`}
          className="grid grid-cols-4 gap-3 rounded-md py-2"
        >
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </SectionCardShell>
  );
}

/** Full overview grid skeleton for route-level loading.tsx. */
export function GroupOverviewSkeleton() {
  return (
    <div
      aria-busy="true"
      className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5"
      data-testid="group-overview-skeleton"
    >
      <MembersCardSkeleton />
      <ScheduleCardSkeleton />
      <ListCardSkeleton rows={3} />
      <ListCardSkeleton rows={2} />
      <ListCardSkeleton rows={3} />
      <AuditLogCardSkeleton />
    </div>
  );
}
