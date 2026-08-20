'use client';

import type { ReactNode } from 'react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { KanbanSkeleton } from '../boards/boardId/kanban/rendering/kanban-skeleton';
import {
  getServerTaskBoardSwitchTransition,
  getTaskBoardSwitchTransition,
  subscribeToTaskBoardSwitchTransition,
} from './board-switch-transition';
import type { ViewType } from './board-views';
import { TaskBoardHeaderSkeleton } from './task-board-loading-state';

interface KanbanPresentationProps {
  boardId: string;
  children: ReactNode;
  currentView: ViewType;
  header: ReactNode;
  initialLayoutReady: boolean;
}

const KANBAN_ENTRANCE_WINDOW_MS = 1900;

type EntranceRun = {
  boardId: string;
  run: number;
};

export function KanbanPresentation({
  boardId,
  children,
  currentView,
  header,
  initialLayoutReady,
}: KanbanPresentationProps) {
  const [readyBoardId, setReadyBoardId] = useState<string | null>(null);
  const [entranceRun, setEntranceRun] = useState<EntranceRun | null>(null);
  const entranceRunRef = useRef(0);
  const handledSwitchSequenceRef = useRef(0);
  const boardSwitchTransition = useSyncExternalStore(
    subscribeToTaskBoardSwitchTransition,
    getTaskBoardSwitchTransition,
    getServerTaskBoardSwitchTransition
  );

  useLayoutEffect(() => {
    if (!initialLayoutReady) return;

    const isNewBoard = readyBoardId !== boardId;
    const isTargetedSwitch =
      boardSwitchTransition.boardId === boardId &&
      boardSwitchTransition.sequence > handledSwitchSequenceRef.current;
    if (!isNewBoard && !isTargetedSwitch) return;

    if (isNewBoard) setReadyBoardId(boardId);
    if (isTargetedSwitch) {
      handledSwitchSequenceRef.current = boardSwitchTransition.sequence;
    }
    entranceRunRef.current += 1;
    setEntranceRun({ boardId, run: entranceRunRef.current });
  }, [boardId, boardSwitchTransition, initialLayoutReady, readyBoardId]);

  useEffect(() => {
    if (entranceRun?.boardId !== boardId) return;

    const timeout = window.setTimeout(
      () => setEntranceRun(null),
      KANBAN_ENTRANCE_WINDOW_MS
    );
    return () => window.clearTimeout(timeout);
  }, [boardId, entranceRun]);

  const ready = readyBoardId === boardId;
  const showSkeleton = currentView === 'kanban' && !ready;
  const entering = currentView === 'kanban' && entranceRun?.boardId === boardId;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-kanban-entrance={entering ? 'active' : undefined}
      data-kanban-layout-restored={
        currentView === 'kanban' ? String(ready) : undefined
      }
    >
      {showSkeleton ? (
        <TaskBoardHeaderSkeleton className="-mt-2" />
      ) : (
        <div key={boardId} data-kanban-board-header="true">
          {header}
        </div>
      )}
      <div
        key={`${boardId}-body`}
        className="min-h-0 flex-1 overflow-hidden"
        data-kanban-board-body
      >
        {showSkeleton ? <KanbanSkeleton root /> : children}
      </div>
    </div>
  );
}
