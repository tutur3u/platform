import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

export function isClosedTaskListColumnCollapsed(column: TaskList) {
  return (
    column.is_external_staging !== true &&
    column.status === 'closed' &&
    column.is_collapsed === true
  );
}

export function isKanbanColumnCollapsed(column: TaskList) {
  return column.is_external_collapsed === true || column.is_collapsed === true;
}
