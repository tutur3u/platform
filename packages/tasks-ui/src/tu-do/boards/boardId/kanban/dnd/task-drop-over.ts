import type { DragEndEvent } from '@dnd-kit/core';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { DragPreviewPosition } from './task-drag-types';

export function getTaskDropOver({
  event,
  originalListId,
  preview,
  columns,
}: {
  event: DragEndEvent;
  originalListId: string | null;
  preview: DragPreviewPosition | null;
  columns: TaskList[];
}): DragEndEvent['over'] {
  if (event.over) return event.over;

  const fallbackListId =
    event.active.data.current?.type === 'Task' &&
    preview?.task.id === String(event.active.id) &&
    preview.listId !== originalListId &&
    columns.some((column) => String(column.id) === preview.listId)
      ? preview.listId
      : null;

  return fallbackListId
    ? ({
        id: fallbackListId,
        data: {
          current: { type: 'ColumnSurface', columnId: fallbackListId },
        },
      } as DragEndEvent['over'])
    : null;
}
