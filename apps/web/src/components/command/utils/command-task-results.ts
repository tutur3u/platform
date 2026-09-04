import type { TaskSearchResult } from './use-task-search';

export type CommandTab = 'tasks' | 'all' | 'navigate' | 'actions';
export type TaskStatusFilter =
  | 'all'
  | 'open'
  | 'assigned'
  | 'overdue'
  | 'due-soon'
  | 'completed';
export type TaskPriorityFilter = 'all' | 'critical' | 'high' | 'normal' | 'low';
export type TaskSort = 'relevance' | 'due' | 'priority' | 'newest';

export interface TaskResultControls {
  priority: TaskPriorityFilter;
  sort: TaskSort;
  status: TaskStatusFilter;
}

const PRIORITY_RANK = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
} as const;

export function parseCommandQuery(query: string): {
  query: string;
  tab: CommandTab | null;
} {
  const trimmed = query.trimStart();
  const prefix = trimmed[0];

  if (prefix === '>') {
    return { query: trimmed.slice(1).trimStart(), tab: 'actions' };
  }

  if (prefix === '/') {
    return { query: trimmed.slice(1).trimStart(), tab: 'navigate' };
  }

  if (prefix === '#') {
    return { query: trimmed.slice(1).trimStart(), tab: 'tasks' };
  }

  return { query, tab: null };
}

export function isTaskOverdue(task: TaskSearchResult, now: Date): boolean {
  return Boolean(
    !task.completed &&
      task.end_date &&
      new Date(task.end_date).getTime() < now.getTime()
  );
}

export function isTaskDueSoon(task: TaskSearchResult, now: Date): boolean {
  if (task.completed || !task.end_date) return false;

  const dueAt = new Date(task.end_date).getTime();
  const difference = dueAt - now.getTime();
  return difference >= 0 && difference <= 3 * 24 * 60 * 60 * 1000;
}

function matchesStatus(
  task: TaskSearchResult,
  status: TaskStatusFilter,
  now: Date
): boolean {
  switch (status) {
    case 'open':
      return !task.completed;
    case 'assigned':
      return Boolean(task.is_assigned_to_current_user && !task.completed);
    case 'overdue':
      return isTaskOverdue(task, now);
    case 'due-soon':
      return isTaskDueSoon(task, now);
    case 'completed':
      return Boolean(task.completed);
    default:
      return true;
  }
}

function compareDates(
  first: string | null | undefined,
  second: string | null | undefined,
  direction: 'asc' | 'desc'
): number {
  if (!first && !second) return 0;
  if (!first) return 1;
  if (!second) return -1;

  const difference = new Date(first).getTime() - new Date(second).getTime();
  return direction === 'asc' ? difference : -difference;
}

export function filterAndSortTasks(
  tasks: TaskSearchResult[],
  controls: TaskResultControls,
  now = new Date()
): TaskSearchResult[] {
  const filtered = tasks.filter((task) => {
    const matchesPriority =
      controls.priority === 'all' || task.priority === controls.priority;
    return matchesPriority && matchesStatus(task, controls.status, now);
  });

  return filtered.toSorted((first, second) => {
    if (controls.sort === 'due') {
      return compareDates(first.end_date, second.end_date, 'asc');
    }

    if (controls.sort === 'priority') {
      const firstRank = first.priority
        ? PRIORITY_RANK[first.priority]
        : Number.MAX_SAFE_INTEGER;
      const secondRank = second.priority
        ? PRIORITY_RANK[second.priority]
        : Number.MAX_SAFE_INTEGER;
      return firstRank - secondRank;
    }

    if (controls.sort === 'newest') {
      return compareDates(first.created_at, second.created_at, 'desc');
    }

    return 0;
  });
}
