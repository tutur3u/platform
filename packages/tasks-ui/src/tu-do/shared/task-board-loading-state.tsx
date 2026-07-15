'use client';

import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { KanbanSkeleton } from '../boards/boardId/kanban/rendering/kanban-skeleton';

const HEADER_ACTIONS = [
  'focus',
  'select',
  'view',
  'status',
  'sort',
  'settings',
];

function TaskBoardHeaderSkeleton({ root = false }: { root?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn('border-b pt-2 pb-2', root ? 'pr-0 pl-2' : 'px-2')}
      data-testid="task-board-header-skeleton"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-7 w-44 rounded-md sm:h-8 sm:w-56" />
        </div>

        <div className="min-w-0 flex-1 basis-72">
          <Skeleton className="h-6 w-full rounded-md sm:h-8" />
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {HEADER_ACTIONS.map((action) => (
            <Skeleton
              className="h-7 w-7 rounded-md sm:h-8 sm:w-8"
              key={action}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TaskBoardLoadingState({
  className,
  root = false,
  showHeader = false,
}: {
  className?: string;
  root?: boolean;
  showHeader?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      className={cn(
        'overflow-hidden bg-transparent',
        root
          ? '-mt-4 -mb-4 -ml-4 h-[calc(100dvh+2rem)] min-h-[calc(32rem+2rem)] w-[calc(100%+2rem)] min-w-[calc(100%+2rem)]'
          : 'h-[calc(100dvh-1rem)] min-h-[32rem] w-full',
        showHeader && 'flex flex-col',
        className
      )}
      data-testid="task-board-loading-state"
    >
      {showHeader ? (
        <>
          <TaskBoardHeaderSkeleton root={root} />
          <div
            className="min-h-0 flex-1 overflow-hidden"
            data-testid="task-board-loading-body"
          >
            <KanbanSkeleton root={root} />
          </div>
        </>
      ) : (
        <KanbanSkeleton root={root} />
      )}
    </div>
  );
}
