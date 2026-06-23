'use client';

import { cn } from '@tuturuuu/utils/format';
import { KanbanSkeleton } from '../boards/boardId/kanban/rendering/kanban-skeleton';

export function TaskBoardLoadingState({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      className={cn(
        'h-[calc(100dvh-1rem)] min-h-[32rem] w-full overflow-hidden bg-background',
        className
      )}
      data-testid="task-board-loading-state"
    >
      <KanbanSkeleton />
    </div>
  );
}
