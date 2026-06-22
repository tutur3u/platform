import { Loader2 } from '@tuturuuu/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { KanbanSkeleton } from '@tuturuuu/ui/tu-do/boards/boardId/kanban/rendering/kanban-skeleton';
import { getCommonMessages } from '../../lib/platform/messages';

type LocaleLoadingProps = {
  locale?: string;
};

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

function MembersCardSkeleton() {
  return (
    <SectionCardShell>
      {Array.from({ length: 5 }, (_, index) => (
        <MemberRowSkeleton key={`member-skel-${index}`} />
      ))}
    </SectionCardShell>
  );
}

function ScheduleCardSkeleton() {
  return (
    <SectionCardShell>
      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {Array.from({ length: 42 }, (_, index) => (
          <Skeleton
            className="aspect-square w-full rounded"
            key={`sched-skel-${index}`}
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

function ListCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SectionCardShell>
      {Array.from({ length: rows }, (_, index) => (
        <ListRowSkeleton key={`list-skel-${index}`} />
      ))}
    </SectionCardShell>
  );
}

export function TaskBoardLoading() {
  return <KanbanSkeleton />;
}

export function UserGroupLoading() {
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

export function UserReportLoading({ locale }: LocaleLoadingProps) {
  const commonMessages = getCommonMessages(locale);

  return (
    <div className="flex min-h-100 w-full items-center justify-center rounded-lg border border-dashed py-20">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-dynamic-blue" />
        <p className="text-muted-foreground text-sm">
          {commonMessages.loading}
        </p>
      </div>
    </div>
  );
}
