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

export function TaskBoardHeaderSkeleton({
  className,
  root = false,
}: {
  className?: string;
  root?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'border-b pt-2 pb-2',
        root ? 'pr-0 pl-2' : 'px-2',
        className
      )}
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

const LIST_SECTIONS = [
  { id: 'todo', rows: 4 },
  { id: 'in-progress', rows: 3 },
  { id: 'done', rows: 2 },
] as const;

/** Status sections with task rows, matching the board's list view. */
export function TaskListSkeleton({ root = false }: { root?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex h-full flex-col gap-4 overflow-hidden py-3',
        root ? 'pr-0 pl-2' : 'px-2'
      )}
      data-testid="task-list-skeleton"
    >
      {LIST_SECTIONS.map((section) => (
        <div className="flex flex-col gap-1" key={section.id}>
          <div className="flex h-9 items-center gap-2 px-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-7 rounded-full" />
          </div>
          {Array.from({ length: section.rows }, (_, index) => (
            <div
              className="flex h-11 items-center gap-3 rounded-lg border bg-card/80 px-3"
              key={`${section.id}-${index}`}
            >
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
              <Skeleton
                className={cn('h-4', index % 2 === 0 ? 'w-2/5' : 'w-1/3')}
              />
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Skeleton className="hidden h-4 w-16 rounded-full sm:block" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TaskBoardLoadingState({
  className,
  root = false,
  showHeader = false,
  view = 'kanban',
}: {
  className?: string;
  root?: boolean;
  showHeader?: boolean;
  /** The board view being opened; list view gets status sections and rows. */
  view?: 'kanban' | 'list';
}) {
  const body =
    view === 'list' ? (
      <TaskListSkeleton root={root} />
    ) : (
      <KanbanSkeleton root={root} />
    );

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
            {body}
          </div>
        </>
      ) : (
        body
      )}
    </div>
  );
}
