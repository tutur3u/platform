import { arrayMove } from '@dnd-kit/sortable';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { getStatusOrder } from '../kanban-constants';

export interface ColumnPositionUpdate {
  listId: string;
  newPosition: number;
}

export function sortKanbanColumns(columns: TaskList[]): TaskList[] {
  return [...columns].sort((a, b) => {
    const statusDelta = getStatusOrder(a.status) - getStatusOrder(b.status);
    if (statusDelta !== 0) return statusDelta;

    const positionDelta = (a.position ?? 0) - (b.position ?? 0);
    if (positionDelta !== 0) return positionDelta;

    return (
      new Date(a.created_at ?? 0).getTime() -
      new Date(b.created_at ?? 0).getTime()
    );
  });
}

export function getColumnReorderUpdates(
  columns: TaskList[],
  activeColumnId: string,
  overColumnId: string
): ColumnPositionUpdate[] | null {
  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return null;
  }

  if (activeColumn.status !== overColumn.status) {
    return null;
  }

  const statusColumns = [...columns]
    .filter((column) => column.status === activeColumn.status)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const activeIndex = statusColumns.findIndex(
    (column) => column.id === activeColumnId
  );
  const overIndex = statusColumns.findIndex(
    (column) => column.id === overColumnId
  );

  if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) {
    return null;
  }

  return arrayMove(statusColumns, activeIndex, overIndex).map(
    (column, index) => ({
      listId: column.id,
      newPosition: index,
    })
  );
}
