import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { TaskStatusKey } from './types';

export const TASK_STATUS_KEYS: readonly TaskStatusKey[] = [
  'backlog',
  'todo',
  'in-progress',
  'review',
  'done',
  'cancelled',
];

export interface BoardStatusDefaults {
  defaultDoneListId?: string | null;
  defaultClosedListId?: string | null;
}

type StatusList = Pick<TaskList, 'id' | 'name' | 'status'> &
  Partial<Pick<TaskList, 'archived' | 'deleted' | 'position'>>;

const BACKLOG_NAME = /backlog/i;

function usableLists(lists: readonly StatusList[]) {
  return lists
    .filter((list) => !list.deleted && !list.archived)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** The list a status key points at on a board, or null when the board has none. */
export function resolveStatusListId(
  key: TaskStatusKey,
  lists: readonly StatusList[],
  defaults: BoardStatusDefaults = {}
): string | null {
  const usable = usableLists(lists);
  const first = (
    status: TaskList['status'],
    pick?: (l: StatusList) => boolean
  ) => usable.find((list) => list.status === status && (pick?.(list) ?? true));
  // A board default only counts when it really is a list of that status.
  const preferred = (
    id: string | null | undefined,
    status: TaskList['status']
  ) =>
    id
      ? usable.find((list) => list.id === id && list.status === status)
      : undefined;

  switch (key) {
    case 'backlog':
      return (
        (
          first('not_started', (l) => BACKLOG_NAME.test(l.name)) ??
          first('not_started')
        )?.id ?? null
      );
    case 'todo':
      return (
        first('not_started', (l) => !BACKLOG_NAME.test(l.name))?.id ?? null
      );
    case 'in-progress':
      return first('active')?.id ?? null;
    case 'review':
      return first('review')?.id ?? null;
    case 'done':
      return (
        (preferred(defaults.defaultDoneListId, 'done') ?? first('done'))?.id ??
        null
      );
    case 'cancelled':
      return (
        (preferred(defaults.defaultClosedListId, 'closed') ?? first('closed'))
          ?.id ?? null
      );
  }
}

/** The status key a list shows as; document lists have none. */
export function getListStatusKey(list: StatusList): TaskStatusKey | null {
  switch (list.status) {
    case 'not_started':
      return BACKLOG_NAME.test(list.name) ? 'backlog' : 'todo';
    case 'active':
      return 'in-progress';
    case 'review':
      return 'review';
    case 'done':
      return 'done';
    case 'closed':
      return 'cancelled';
    default:
      return null;
  }
}

export interface StatusListGroup<T extends StatusList = StatusList> {
  key: TaskStatusKey;
  lists: T[];
}

/**
 * The board's lists grouped by status in display order, each group sorted by
 * list position. Every real list is kept, so a board with several lists for one
 * status shows them all rather than one collapsed entry.
 */
export function groupListsByStatus<T extends StatusList>(
  lists: readonly T[]
): StatusListGroup<T>[] {
  const groups = new Map<TaskStatusKey, T[]>();
  for (const list of usableLists(lists) as T[]) {
    const key = getListStatusKey(list);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), list]);
  }
  return TASK_STATUS_KEYS.flatMap((key) => {
    const grouped = groups.get(key);
    return grouped ? [{ key, lists: grouped }] : [];
  });
}
