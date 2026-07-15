import type { Task } from '@tuturuuu/types/primitives/Task';
import { priorityCompare } from '@tuturuuu/utils/task-helper';

export type ListViewSortField =
  | 'name'
  | 'priority'
  | 'start_date'
  | 'end_date'
  | 'assignees'
  | 'created_at'
  | 'status';

export type ListViewSortOrder = 'asc' | 'desc';

interface SortListViewTasksOptions {
  preserveTaskOrder?: boolean;
  searchQuery?: string;
  sortField: ListViewSortField;
  sortOrder: ListViewSortOrder;
}

export function sortListViewTasks(
  tasks: Task[],
  {
    preserveTaskOrder = false,
    searchQuery,
    sortField,
    sortOrder,
  }: SortListViewTasksOptions
) {
  const sorted = [...tasks];

  if (preserveTaskOrder || searchQuery?.trim()) {
    return sorted;
  }

  sorted.sort((a, b) => {
    const aCompleted = !!a.closed_at;
    const bCompleted = !!b.closed_at;

    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1;
    }

    let comparison = 0;

    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'priority': {
        const aPriority = a.priority ?? null;
        const bPriority = b.priority ?? null;
        comparison = priorityCompare(aPriority, bPriority);
        break;
      }
      case 'start_date': {
        const aDate = a.start_date
          ? new Date(a.start_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bDate = b.start_date
          ? new Date(b.start_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        comparison = aDate - bDate;
        break;
      }
      case 'end_date': {
        const aDate = a.end_date
          ? new Date(a.end_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bDate = b.end_date
          ? new Date(b.end_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        comparison = aDate - bDate;
        break;
      }
      case 'created_at': {
        const aCreated = new Date(a.created_at).getTime();
        const bCreated = new Date(b.created_at).getTime();
        comparison = aCreated - bCreated;
        break;
      }
      case 'assignees': {
        const aLength = a.assignees?.length || 0;
        const bLength = b.assignees?.length || 0;
        comparison = aLength - bLength;
        break;
      }
      case 'status': {
        const getStatus = (task: Task) => {
          if (task.closed_at) return 'closed';
          if (task.completed_at) return 'completed';
          return 'active';
        };

        const statusOrder = { closed: 2, completed: 1, active: 0 };
        const aStatus = getStatus(a);
        const bStatus = getStatus(b);
        comparison = statusOrder[aStatus] - statusOrder[bStatus];
        break;
      }
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });

  return sorted;
}
