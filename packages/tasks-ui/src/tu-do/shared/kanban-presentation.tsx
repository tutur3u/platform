'use client';

import type { ReactNode } from 'react';
import { useLayoutEffect, useState } from 'react';
import { KanbanSkeleton } from '../boards/boardId/kanban/rendering/kanban-skeleton';
import type { ViewType } from './board-views';

interface KanbanPresentationProps {
  boardId: string;
  children: ReactNode;
  currentView: ViewType;
  initialLayoutReady: boolean;
}

export function KanbanPresentation({
  boardId,
  children,
  currentView,
  initialLayoutReady,
}: KanbanPresentationProps) {
  const [readyBoardId, setReadyBoardId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!initialLayoutReady || readyBoardId === boardId) return;
    setReadyBoardId(boardId);
  }, [boardId, initialLayoutReady, readyBoardId]);

  const ready = readyBoardId === boardId;
  const showSkeleton = currentView === 'kanban' && !ready;

  return (
    <div
      className="h-full overflow-hidden"
      data-kanban-layout-restored={
        currentView === 'kanban' ? String(ready) : undefined
      }
    >
      {showSkeleton ? <KanbanSkeleton root /> : children}
    </div>
  );
}
