'use client';

import { cn } from '@tuturuuu/utils/format';
import { KanbanSkeleton } from '../boards/boardId/kanban/rendering/kanban-skeleton';

export function TaskBoardLoadingState({
  className,
  root = false,
}: {
  className?: string;
  root?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      className={cn(
        'overflow-hidden bg-transparent',
        root
          ? '-m-4 h-[calc(100dvh+2rem)] min-h-[calc(32rem+2rem)] w-[calc(100%+2rem)] min-w-[calc(100%+2rem)]'
          : 'h-[calc(100dvh-1rem)] min-h-[32rem] w-full',
        className
      )}
      data-testid="task-board-loading-state"
    >
      <KanbanSkeleton root={root} />
    </div>
  );
}
