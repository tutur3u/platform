import { useQuery } from '@tanstack/react-query';
import {
  type ListWorkspaceTasksOptions,
  listWorkspaceTasks,
  searchWorkspaceTasks,
  type WorkspaceTaskSearchResult,
} from '@tuturuuu/internal-api/tasks';
import * as React from 'react';
import type {
  TaskPriorityFilter,
  TaskResultControls,
  TaskSort,
  TaskStatusFilter,
} from './command-task-results';

export type TaskSearchResult = WorkspaceTaskSearchResult;

/**
 * Validates if a string is a valid UUID
 */
function isValidUUID(str: string | null): boolean {
  if (!str) return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Debounce hook to delay search queries
 */
function useDebounced<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export const commandTaskQueryKey = (wsId: string | null) => [
  'command-center-tasks',
  wsId,
];

export function normalizeCommandTask(
  task: WorkspaceTaskSearchResult
): TaskSearchResult {
  return {
    ...task,
    completed: task.completed ?? Boolean(task.completed_at),
  };
}

function getServerSort(sort: TaskSort): ListWorkspaceTasksOptions['sortBy'] {
  switch (sort) {
    case 'due':
      return 'due-date-asc';
    case 'priority':
      return 'priority-high';
    default:
      return 'created-date-desc';
  }
}

function getStatusOptions(
  status: TaskStatusFilter,
  now: Date
): ListWorkspaceTasksOptions {
  switch (status) {
    case 'open':
      return { closed: 'exclude', completed: 'exclude' };
    case 'assigned':
      return {
        assignedToMe: true,
        closed: 'exclude',
        completed: 'exclude',
      };
    case 'overdue':
      return {
        closed: 'exclude',
        completed: 'exclude',
        dueDateTo: now.toISOString(),
      };
    case 'due-soon': {
      const dueSoonCutoff = new Date(now);
      dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 3);
      return {
        closed: 'exclude',
        completed: 'exclude',
        dueDateFrom: now.toISOString(),
        dueDateTo: dueSoonCutoff.toISOString(),
      };
    }
    case 'completed':
      return { completed: 'only' };
    default:
      return {};
  }
}

export function buildCommandTaskListOptions(
  query: string,
  controls: TaskResultControls,
  now = new Date()
): ListWorkspaceTasksOptions {
  return {
    ...getStatusOptions(controls.status, now),
    limit: query ? 40 : 30,
    priorities: controls.priority === 'all' ? undefined : [controls.priority],
    q: query || undefined,
    sortBy: getServerSort(controls.sort),
  };
}

export function shouldUseFilteredTaskList(
  query: string,
  status: TaskStatusFilter,
  priority: TaskPriorityFilter,
  sort: TaskSort
): boolean {
  return Boolean(
    query && (status !== 'all' || priority !== 'all' || sort !== 'relevance')
  );
}

/**
 * Hook for searching tasks in the workspace
 */
export function useTaskSearch(
  wsId: string | null,
  query: string,
  enabled: boolean,
  controls: TaskResultControls
) {
  const debouncedQuery = useDebounced(query.trim(), 300);
  const hasQuery = debouncedQuery.length > 0;
  const useFilteredTaskList = shouldUseFilteredTaskList(
    debouncedQuery,
    controls.status,
    controls.priority,
    controls.sort
  );

  // Only enable queries if wsId is a valid UUID (not legacy identifiers like "internal" or "personal")
  const isValidWorkspace = isValidUUID(wsId);

  // Fetch recent/all tasks when no query
  const recentTasksQuery = useQuery({
    queryKey: [
      ...commandTaskQueryKey(wsId),
      'list',
      debouncedQuery,
      controls.status,
      controls.priority,
      controls.sort,
    ],
    queryFn: async () => {
      if (!wsId) return [];

      const data = await listWorkspaceTasks(
        wsId,
        buildCommandTaskListOptions(debouncedQuery, controls)
      );
      return (data.tasks ?? []).map((task) => normalizeCommandTask(task));
    },
    enabled: enabled && (!hasQuery || useFilteredTaskList) && isValidWorkspace,
    staleTime: 30000, // 30 seconds
  });

  // Semantic search when query exists
  const searchTasksQuery = useQuery({
    queryKey: [...commandTaskQueryKey(wsId), 'search', debouncedQuery],
    queryFn: async () => {
      if (!wsId || !debouncedQuery) return [];

      const data = await searchWorkspaceTasks(wsId, {
        query: debouncedQuery,
        matchCount: 40,
        mode: 'hybrid',
      });

      return (data.tasks || []).map((task) => normalizeCommandTask(task));
    },
    enabled: enabled && hasQuery && !useFilteredTaskList && isValidWorkspace,
    staleTime: 30000, // 30 seconds
  });

  // Return appropriate query based on whether there's a search query
  if (hasQuery && !useFilteredTaskList) {
    return {
      tasks: searchTasksQuery.data || [],
      isLoading: searchTasksQuery.isLoading,
      error: searchTasksQuery.error,
    };
  }

  return {
    tasks: recentTasksQuery.data || [],
    isLoading: recentTasksQuery.isLoading,
    error: recentTasksQuery.error,
  };
}
