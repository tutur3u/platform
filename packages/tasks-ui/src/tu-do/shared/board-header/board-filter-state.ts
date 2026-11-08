import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type {
  BoardFiltersMetadata,
  SortOption,
  TaskAssignee,
  TaskFilters,
} from '../task-filter.types';

/** `open` keeps every list that is not done or closed. */
export type ListStatusFilter = 'all' | 'active' | 'not_started' | 'open';

export const OPEN_LIST_STATUSES = ['not_started', 'active', 'review'] as const;

/** The header only offers priority sorting. */
export const BOARD_SORT_OPTIONS = ['priority-high', 'priority-low'] as const;
export type BoardSortOption = (typeof BOARD_SORT_OPTIONS)[number];

export interface BoardPerson extends TaskAssignee {
  taskCount: number;
}

export const DEFAULT_BOARD_FILTERS: TaskFilters = {
  labels: [],
  assignees: [],
  projects: [],
  priorities: [],
  dueDateRange: null,
  estimationRange: null,
  includeMyTasks: false,
  includeUnassigned: false,
  sourceScope: 'all_visible',
  sourceWorkspaceIds: [],
  sourceBoardIds: [],
};

export function isBoardSortOption(
  value: SortOption | undefined
): value is BoardSortOption {
  return BOARD_SORT_OPTIONS.includes(value as BoardSortOption);
}

export function getListStatusesForFilter(
  filter: ListStatusFilter
): string[] | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'open') return [...OPEN_LIST_STATUSES];
  return [filter];
}

export function listMatchesStatusFilter(
  list: Pick<TaskList, 'status'>,
  filter: ListStatusFilter
) {
  const statuses = getListStatusesForFilter(filter);
  return !statuses || statuses.includes(list.status ?? '');
}

/** Ids of the people the filter currently shows, including "me". */
export function getSelectedPersonIds(
  filters: TaskFilters,
  currentUserId?: string
) {
  const ids = new Set(filters.assignees.map((assignee) => assignee.id));
  if (filters.includeMyTasks && currentUserId) ids.add(currentUserId);
  return ids;
}

/**
 * Toggles one person pill. Picking only yourself is "Mine", which keeps the
 * existing assigned-to-me query; people and Unassigned exclude each other.
 */
export function togglePersonFilter(
  filters: TaskFilters,
  personId: string,
  people: readonly TaskAssignee[],
  currentUserId?: string
): TaskFilters {
  const selected = getSelectedPersonIds(filters, currentUserId);
  if (selected.has(personId)) selected.delete(personId);
  else selected.add(personId);

  const known = new Map(
    [...filters.assignees, ...people].map((person) => [person.id, person])
  );
  const assignees = [...selected]
    .map((id) => known.get(id))
    .filter((person): person is TaskAssignee => Boolean(person))
    .map(({ id, display_name, avatar_url, email }) => ({
      id,
      display_name,
      avatar_url,
      email,
    }));

  return {
    ...filters,
    assignees,
    includeMyTasks:
      assignees.length === 1 && assignees[0]?.id === currentUserId,
    includeUnassigned: false,
  };
}

export function toggleUnassignedFilter(filters: TaskFilters): TaskFilters {
  return {
    ...filters,
    assignees: [],
    includeMyTasks: false,
    includeUnassigned: !filters.includeUnassigned,
  };
}

export function toggleProjectFilter(
  filters: TaskFilters,
  project: { id: string; name: string }
): TaskFilters {
  const selected = filters.projects.some((item) => item.id === project.id);
  return {
    ...filters,
    projects: selected
      ? filters.projects.filter((item) => item.id !== project.id)
      : [...filters.projects, { id: project.id, name: project.name }],
  };
}

/** Focus: my open tasks, highest priority first. */
export function isFocusActive(
  filters: TaskFilters,
  listStatusFilter: ListStatusFilter,
  currentUserId?: string
) {
  const selected = getSelectedPersonIds(filters, currentUserId);
  return (
    Boolean(currentUserId) &&
    listStatusFilter === 'open' &&
    filters.sortBy === 'priority-high' &&
    filters.includeMyTasks &&
    selected.size === 1 &&
    !filters.includeUnassigned &&
    filters.projects.length === 0
  );
}

export function toggleFocus({
  currentUser,
  filters,
  listStatusFilter,
}: {
  currentUser?: TaskAssignee;
  filters: TaskFilters;
  listStatusFilter: ListStatusFilter;
}): { filters: TaskFilters; listStatusFilter: ListStatusFilter } {
  if (isFocusActive(filters, listStatusFilter, currentUser?.id)) {
    return {
      filters: {
        ...filters,
        assignees: [],
        includeMyTasks: false,
        sortBy: undefined,
      },
      listStatusFilter: 'all',
    };
  }

  return {
    filters: {
      ...filters,
      assignees: currentUser ? [currentUser] : [],
      includeMyTasks: Boolean(currentUser),
      includeUnassigned: false,
      projects: [],
      sortBy: 'priority-high',
    },
    listStatusFilter: 'open',
  };
}

/** Any filter the Clear button would reset, including ones from older saves. */
export function hasActiveBoardFilters(
  filters: TaskFilters,
  listStatusFilter: ListStatusFilter
) {
  return (
    Boolean(filters.searchQuery?.trim()) ||
    filters.assignees.length > 0 ||
    filters.includeMyTasks ||
    filters.includeUnassigned ||
    filters.projects.length > 0 ||
    listStatusFilter !== 'all' ||
    filters.labels.length > 0 ||
    filters.priorities.length > 0 ||
    Boolean(filters.dueDateRange?.from || filters.dueDateRange?.to) ||
    typeof filters.estimationRange?.min === 'number' ||
    typeof filters.estimationRange?.max === 'number' ||
    (filters.sourceScope ?? 'all_visible') !== 'all_visible'
  );
}

export function clearBoardFilters(filters: TaskFilters): TaskFilters {
  return {
    ...DEFAULT_BOARD_FILTERS,
    hideEmptyTaskLists: filters.hideEmptyTaskLists,
  };
}

/**
 * Saved board configs can carry filters the header no longer offers (labels,
 * priorities, due and estimate ranges, source scope, non-priority sorts).
 * Drop them so nothing invisible keeps filtering the board.
 */
export function sanitizeSavedBoardFilters(
  saved: Partial<TaskFilters> | undefined
): TaskFilters {
  const sortBy = isBoardSortOption(saved?.sortBy) ? saved.sortBy : undefined;
  return {
    ...DEFAULT_BOARD_FILTERS,
    assignees: Array.isArray(saved?.assignees) ? saved.assignees : [],
    projects: Array.isArray(saved?.projects) ? saved.projects : [],
    includeMyTasks: saved?.includeMyTasks === true,
    includeUnassigned: saved?.includeUnassigned === true,
    ...(saved?.hideEmptyTaskLists !== undefined
      ? { hideEmptyTaskLists: saved.hideEmptyTaskLists }
      : {}),
    ...(sortBy ? { sortBy } : {}),
  };
}

export function sanitizeListStatusFilter(value: unknown): ListStatusFilter {
  return value === 'open' ? 'open' : 'all';
}

/** Presence is shared context, not authority to restore retired controls. */
export function sanitizePresenceBoardView(
  metadata: BoardFiltersMetadata,
  currentUserId?: string
) {
  const filters = sanitizeSavedBoardFilters(metadata.filters);
  return {
    filters: {
      ...filters,
      includeMyTasks:
        filters.assignees.length === 1 &&
        filters.assignees[0]?.id === currentUserId,
      includeUnassigned:
        filters.assignees.length === 0 && filters.includeUnassigned,
    },
    listStatusFilter: sanitizeListStatusFilter(metadata.listStatusFilter),
  };
}

/**
 * People shown as pills: board members and existing task assignees, you first,
 * then by how many loaded tasks they own.
 */
type TaskAssigneeLike = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
};

export function collectBoardPeople(
  tasks: readonly { assignees?: TaskAssigneeLike[] | null }[],
  currentUserId?: string,
  members: readonly TaskAssigneeLike[] = []
): BoardPerson[] {
  const byId = new Map<string, BoardPerson>(
    members.map((member) => [
      member.id,
      {
        ...member,
        display_name: member.display_name ?? null,
        taskCount: 0,
      },
    ])
  );
  for (const task of tasks) {
    for (const assignee of task.assignees ?? []) {
      if (!assignee?.id) continue;
      const existing = byId.get(assignee.id);
      if (existing) existing.taskCount += 1;
      else
        byId.set(assignee.id, {
          id: assignee.id,
          display_name: assignee.display_name ?? null,
          avatar_url: assignee.avatar_url ?? null,
          email: assignee.email ?? null,
          taskCount: 1,
        });
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount;
    return (a.display_name ?? a.email ?? '').localeCompare(
      b.display_name ?? b.email ?? ''
    );
  });
}

export function countUnassignedTasks(
  tasks: readonly { assignees?: unknown[] | null }[]
) {
  return tasks.filter((task) => (task.assignees?.length ?? 0) === 0).length;
}
