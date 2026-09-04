import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

export type TaskSortBy =
  | 'name-asc'
  | 'name-desc'
  | 'priority-high'
  | 'priority-low'
  | 'due-date-asc'
  | 'due-date-desc'
  | 'created-date-desc'
  | 'created-date-asc'
  | 'estimation-high'
  | 'estimation-low';

export type SortableTask = {
  id: string;
  name: string;
  priority?: TaskPriority | null;
  end_date?: string | null;
  created_at?: string | null;
  estimation_points?: number | null;
};

export function parseTaskSortBy(value: string | null) {
  switch (value) {
    case 'name-asc':
    case 'name-desc':
    case 'priority-high':
    case 'priority-low':
    case 'due-date-asc':
    case 'due-date-desc':
    case 'created-date-desc':
    case 'created-date-asc':
    case 'estimation-high':
    case 'estimation-low':
      return value satisfies TaskSortBy;
    default:
      return undefined;
  }
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function compareNullable<T>(
  a: T | null | undefined,
  b: T | null | undefined,
  compare: (left: T, right: T) => number
) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return compare(a, b);
}

function compareText(a: string, b: string) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}

function getTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function compareCreatedFallback(a: SortableTask, b: SortableTask) {
  const created = compareNullable(
    getTimestamp(a.created_at),
    getTimestamp(b.created_at),
    (left, right) => right - left
  );
  return created || a.id.localeCompare(b.id);
}

export function compareTasksByCriterion(
  a: SortableTask,
  b: SortableTask,
  sortBy: TaskSortBy
) {
  let result = 0;

  switch (sortBy) {
    case 'name-asc':
      result = compareText(a.name, b.name);
      break;
    case 'name-desc':
      result = compareText(b.name, a.name);
      break;
    case 'priority-high':
      result = compareNullable(
        a.priority,
        b.priority,
        (left, right) => PRIORITY_RANK[left] - PRIORITY_RANK[right]
      );
      break;
    case 'priority-low':
      result = compareNullable(
        a.priority,
        b.priority,
        (left, right) => PRIORITY_RANK[right] - PRIORITY_RANK[left]
      );
      break;
    case 'due-date-asc':
      result = compareNullable(
        getTimestamp(a.end_date),
        getTimestamp(b.end_date),
        (left, right) => left - right
      );
      break;
    case 'due-date-desc':
      result = compareNullable(
        getTimestamp(a.end_date),
        getTimestamp(b.end_date),
        (left, right) => right - left
      );
      break;
    case 'created-date-asc':
      result = compareNullable(
        getTimestamp(a.created_at),
        getTimestamp(b.created_at),
        (left, right) => left - right
      );
      break;
    case 'created-date-desc':
      result = compareNullable(
        getTimestamp(a.created_at),
        getTimestamp(b.created_at),
        (left, right) => right - left
      );
      break;
    case 'estimation-high':
      result = compareNullable(
        a.estimation_points,
        b.estimation_points,
        (left, right) => right - left
      );
      break;
    case 'estimation-low':
      result = compareNullable(
        a.estimation_points,
        b.estimation_points,
        (left, right) => left - right
      );
      break;
  }

  return result || compareCreatedFallback(a, b);
}

export function sortTasksByCriterion<T extends SortableTask>(
  tasks: readonly T[],
  sortBy: TaskSortBy | null | undefined
) {
  if (!sortBy) return [...tasks];
  return [...tasks].sort((a, b) => compareTasksByCriterion(a, b, sortBy));
}
