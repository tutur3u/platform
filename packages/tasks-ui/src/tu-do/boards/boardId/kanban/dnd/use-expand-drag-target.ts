import { type DragOverEvent, useDndMonitor } from '@dnd-kit/core';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useCallback, useEffect, useRef } from 'react';
import { isKanbanColumnCollapsed } from '../kanban-column-collapse';

export function useExpandDragTarget({
  column,
  readOnly,
  onExternalTasksCollapsedChange,
  onTaskListCollapsedChange,
}: {
  column: TaskList;
  readOnly: boolean;
  onExternalTasksCollapsedChange?: (collapsed: boolean) => void;
  onTaskListCollapsedChange?: (id: string, collapsed: boolean) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (readOnly || !isKanbanColumnCollapsed(column)) cancel();
  }, [readOnly, column, cancel]);
  const isTarget = ({ active, over }: DragOverEvent) =>
    !readOnly &&
    active.data.current?.type === 'Task' &&
    isKanbanColumnCollapsed(column) &&
    String(over?.id) === column.id;
  const expand = () => {
    if (column.is_external_staging) onExternalTasksCollapsedChange?.(false);
    else onTaskListCollapsedChange?.(column.id, false);
  };
  useDndMonitor({
    onDragOver(event) {
      cancel();
      if (!isTarget(event)) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        expand();
      }, 400);
    },
    onDragEnd(event) {
      cancel();
      if (isTarget(event)) expand();
    },
    onDragCancel: cancel,
  });
}
