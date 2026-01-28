'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useMemo } from 'react';
import { BoardColumn } from '../../board-column';
import { TaskCard } from '../../task';

interface DragPreviewProps {
  activeTask: Task | null;
  activeColumn: TaskList | null;
  tasks: Task[];
  columns: TaskList[];
  boardId: string;
  isPersonalWorkspace: boolean;
  isMultiSelectMode: boolean;
  selectedTasks: Set<string>;
  onUpdate: () => void;
  wsId: string;
}

export function DragPreview({
  activeTask,
  activeColumn,
  tasks,
  columns,
  boardId,
  isPersonalWorkspace,
  isMultiSelectMode,
  selectedTasks,
  onUpdate,
  wsId,
}: DragPreviewProps) {
  const MemoizedTaskOverlay = useMemo(() => {
    if (!activeTask) return null;

    const taskList = columns.find(
      (col) => String(col.id) === String(activeTask.list_id)
    );

    const isMultiCardDrag =
      isMultiSelectMode &&
      selectedTasks.size > 1 &&
      selectedTasks.has(activeTask.id);

    return (
      <div className="relative">
        <TaskCard
          task={activeTask}
          taskList={taskList}
          boardId={boardId ?? ''}
          isOverlay
          onUpdate={onUpdate}
          isPersonalWorkspace={isPersonalWorkspace}
        />
        {isMultiCardDrag && (
          <>
            {/* Stacked card effect - show up to 2 additional card shadows */}
            <div
              className="pointer-events-none absolute top-1 left-1 -z-10 h-full w-full rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/5 shadow-lg"
              style={{ transform: 'translateZ(-10px)' }}
            />
            {selectedTasks.size > 2 && (
              <div
                className="pointer-events-none absolute top-2 left-2 -z-20 h-full w-full rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/3 shadow-md"
                style={{ transform: 'translateZ(-20px)' }}
              />
            )}
            {/* Badge showing count */}
            <div className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-blue text-white shadow-lg ring-2 ring-background">
              <span className="font-bold text-xs">{selectedTasks.size}</span>
            </div>
          </>
        )}
      </div>
    );
  }, [
    activeTask,
    columns,
    boardId,
    onUpdate,
    isPersonalWorkspace,
    isMultiSelectMode,
    selectedTasks,
  ]);

  const MemoizedColumnOverlay = useMemo(
    () =>
      activeColumn ? (
        <BoardColumn
          column={activeColumn}
          boardId={boardId ?? ''}
          tasks={tasks.filter((task) => task.list_id === activeColumn.id)}
          isOverlay
          isPersonalWorkspace={isPersonalWorkspace}
          onUpdate={onUpdate}
          wsId={wsId}
        />
      ) : null,
    [activeColumn, tasks, boardId, isPersonalWorkspace, onUpdate, wsId]
  );

  return <>{MemoizedTaskOverlay || MemoizedColumnOverlay}</>;
}
