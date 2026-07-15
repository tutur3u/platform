import type { Task } from '@tuturuuu/types/primitives/Task';
import { MAX_SAFE_INTEGER_SORT } from '../kanban-constants';

type SortKeyTask = Pick<
  Task,
  | 'is_personal_external'
  | 'is_personal_external_default'
  | 'personal_sort_key'
  | 'sort_key'
>;

type SortableTask = SortKeyTask & Pick<Task, 'created_at'>;

export function getEffectiveTaskSortKey(task: SortKeyTask) {
  if (typeof task.sort_key === 'number' && Number.isFinite(task.sort_key)) {
    return task.sort_key;
  }

  if (
    task.is_personal_external === true &&
    task.is_personal_external_default !== true &&
    typeof task.personal_sort_key === 'number' &&
    Number.isFinite(task.personal_sort_key)
  ) {
    return task.personal_sort_key;
  }

  return null;
}

export function compareTasksByEffectiveSortKey(
  left: SortableTask,
  right: SortableTask
) {
  const leftSortKey = getEffectiveTaskSortKey(left) ?? MAX_SAFE_INTEGER_SORT;
  const rightSortKey = getEffectiveTaskSortKey(right) ?? MAX_SAFE_INTEGER_SORT;

  if (leftSortKey !== rightSortKey) {
    return leftSortKey - rightSortKey;
  }

  if (!left.created_at || !right.created_at) return 0;

  return (
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );
}
