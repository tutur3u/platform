'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';

const RAILS = ['upcoming', 'external'];
const COLUMNS = [
  { id: 'documents', cards: 3, width: 'w-[21rem] sm:w-[23rem]' },
  { id: 'inactive', cards: 1, width: 'w-[20rem] sm:w-[22rem]' },
  { id: 'todo', cards: 2, width: 'w-[21rem] sm:w-[23rem]' },
  { id: 'blocked', cards: 1, width: 'w-[20rem] sm:w-[22rem]' },
] as const;

function KanbanCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-lg border bg-card/80 p-3 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          {!compact && <Skeleton className="h-4 w-3/5" />}
        </div>
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="h-4 w-14 rounded-full" />
        {!compact && <Skeleton className="h-4 w-16 rounded-full" />}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

function KanbanColumnSkeleton({
  cards,
  className,
}: {
  cards: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/20',
        className
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-7 rounded-full" />
        </div>
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
        {Array.from({ length: cards }).map((_, index) => (
          <KanbanCardSkeleton
            compact={index === cards - 1 && cards > 1}
            key={`${cards}-${index}`}
          />
        ))}
        <div className="mt-auto pt-3">
          <Skeleton className="h-9 w-full rounded-lg border border-dashed bg-transparent" />
        </div>
      </div>
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-full overflow-hidden bg-transparent"
      data-testid="kanban-skeleton"
    >
      <div className="flex h-full gap-2 overflow-hidden p-2 sm:gap-3">
        <div className="hidden shrink-0 gap-2 sm:flex">
          {RAILS.map((rail) => (
            <div
              className="flex h-full w-10 flex-col items-center rounded-xl border border-dashed bg-muted/10 p-2"
              key={rail}
            >
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="mt-5 h-5 w-5 rounded-full" />
              <Skeleton className="mt-6 h-28 w-3 rounded-full" />
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 gap-3 overflow-hidden">
          {COLUMNS.map((column) => (
            <KanbanColumnSkeleton
              cards={column.cards}
              className={column.width}
              key={column.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
