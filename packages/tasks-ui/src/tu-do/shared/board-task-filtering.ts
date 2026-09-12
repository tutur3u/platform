import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  sortTasksByCriterion,
  type UnprioritizedPosition,
} from '@tuturuuu/utils/task-helper';
import { taskMatchesBoardSearch } from './board-task-search';
import type { TaskFilters } from './task-filter.types';

export function taskMatchesLocalFilters(
  task: Task,
  filters: TaskFilters,
  currentUserId?: string,
  boardTicketPrefix?: string | null
) {
  if (!taskMatchesBoardSearch(task, filters.searchQuery, boardTicketPrefix))
    return false;

  if (
    filters.labels.length > 0 &&
    !filters.labels.every((label) =>
      task.labels?.some((taskLabel) => taskLabel.id === label.id)
    )
  ) {
    return false;
  }

  if (
    filters.projects.length > 0 &&
    !filters.projects.every((project) =>
      task.projects?.some((taskProject) => taskProject.id === project.id)
    )
  ) {
    return false;
  }

  if (
    filters.priorities.length > 0 &&
    (!task.priority || !filters.priorities.includes(task.priority))
  ) {
    return false;
  }

  if (filters.assignees.length > 0) {
    const assigneeIds = new Set(
      filters.assignees.map((assignee) => assignee.id)
    );
    if (!task.assignees?.some((assignee) => assigneeIds.has(assignee.id))) {
      return false;
    }
  }

  if (
    filters.includeMyTasks &&
    currentUserId &&
    !task.assignees?.some((assignee) => assignee.id === currentUserId)
  ) {
    return false;
  }

  if (filters.includeUnassigned && (task.assignees?.length ?? 0) > 0) {
    return false;
  }

  if (filters.dueDateRange?.from || filters.dueDateRange?.to) {
    if (!task.end_date) return false;
    const dueTime = new Date(task.end_date).getTime();
    const fromTime = filters.dueDateRange.from?.getTime() ?? -Infinity;
    const toTime = filters.dueDateRange.to?.getTime() ?? Infinity;
    if (dueTime < fromTime || dueTime > toTime) return false;
  }

  if (
    typeof filters.estimationRange?.min === 'number' ||
    typeof filters.estimationRange?.max === 'number'
  ) {
    const estimate = task.estimation_points ?? 0;
    const min = filters.estimationRange.min ?? -Infinity;
    const max = filters.estimationRange.max ?? Infinity;
    if (estimate < min || estimate > max) return false;
  }

  return true;
}

export function sortLocalTasks(
  tasks: Task[],
  sortBy: TaskFilters['sortBy'],
  position: UnprioritizedPosition
) {
  return sortTasksByCriterion(tasks, sortBy, position);
}
