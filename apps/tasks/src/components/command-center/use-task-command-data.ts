'use client';

import { useQuery } from '@tanstack/react-query';
import {
  listWorkspaceBoardsWithLists,
  listWorkspaceTasks,
  searchWorkspaceTasks,
  type WorkspaceTaskSearchResult,
} from '@tuturuuu/internal-api/tasks';
import { useEffect, useMemo, useState } from 'react';
import {
  buildTaskCommandListOptions,
  parseTaskCommandQuery,
} from './task-command-utils';

export type TaskCommandResult = WorkspaceTaskSearchResult & {
  completed: boolean;
};

export const taskCommandQueryKey = (wsId: string) => [
  'tasks-command-center',
  wsId,
];

export function useTaskCommandData({
  enabled,
  query,
  wsId,
}: {
  enabled: boolean;
  query: string;
  wsId: string;
}) {
  const deferredQuery = useDebouncedValue(query.trim(), 160);
  const parsed = useMemo(
    () => parseTaskCommandQuery(deferredQuery),
    [deferredQuery]
  );
  const usesFilteredList = Boolean(parsed.tokens.length || !parsed.query);
  const taskQuery = useQuery({
    enabled,
    queryFn: async () => {
      const tasks = usesFilteredList
        ? (await listWorkspaceTasks(wsId, buildTaskCommandListOptions(parsed)))
            .tasks
        : (
            await searchWorkspaceTasks(wsId, {
              matchCount: 40,
              mode: 'hybrid',
              query: parsed.query,
            })
          ).tasks;
      return (tasks ?? []).map(normalizeTask);
    },
    queryKey: [...taskCommandQueryKey(wsId), 'results', parsed],
    staleTime: 20_000,
  });
  const boardsQuery = useQuery({
    enabled,
    queryFn: () => listWorkspaceBoardsWithLists(wsId),
    queryKey: [...taskCommandQueryKey(wsId), 'boards-with-lists'],
    staleTime: 60_000,
  });

  return {
    boards: boardsQuery.data?.boards ?? [],
    isLoading: taskQuery.isLoading,
    parsed,
    tasks: taskQuery.data ?? [],
  };
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function normalizeTask(task: WorkspaceTaskSearchResult): TaskCommandResult {
  return {
    ...task,
    completed: task.completed ?? Boolean(task.completed_at),
  };
}
