'use client';

import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { KanbanSkeleton } from '../boards/boardId/kanban/rendering/kanban-skeleton';
import type { ViewType } from './board-views';

interface KanbanPresentationProps {
  boardId: string;
  children: ReactNode;
  currentView: ViewType;
  header: ReactNode;
  initialLayoutReady: boolean;
}

const KANBAN_ENTRANCE_WINDOW_MS = 1600;

export function KanbanPresentation({
  boardId,
  children,
  currentView,
  header,
  initialLayoutReady,
}: KanbanPresentationProps) {
  const [readyBoardId, setReadyBoardId] = useState<string | null>(null);
  const [enteringBoardId, setEnteringBoardId] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!initialLayoutReady || readyBoardId === boardId) return;
    setReadyBoardId(boardId);
    setEnteringBoardId(boardId);
  }, [boardId, initialLayoutReady, readyBoardId]);

  useEffect(() => {
    if (enteringBoardId !== boardId) return;

    const timeout = window.setTimeout(
      () => setEnteringBoardId(null),
      KANBAN_ENTRANCE_WINDOW_MS
    );
    return () => window.clearTimeout(timeout);
  }, [boardId, enteringBoardId]);

  const ready = readyBoardId === boardId;
  const showSkeleton = currentView === 'kanban' && !ready;
  const entering = currentView === 'kanban' && enteringBoardId === boardId;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-kanban-entrance={entering ? 'active' : undefined}
      data-kanban-layout-restored={
        currentView === 'kanban' ? String(ready) : undefined
      }
    >
      <div
        className={showSkeleton ? 'invisible' : undefined}
        data-kanban-board-header="true"
      >
        {header}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden" data-kanban-board-body>
        {showSkeleton ? <KanbanSkeleton root /> : children}
      </div>
    </div>
  );
}
