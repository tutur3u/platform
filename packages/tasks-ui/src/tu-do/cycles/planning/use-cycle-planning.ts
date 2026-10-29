'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CyclePlanningDataSource } from './cycle-planning-api';
import type { CyclePlanningTask } from './types';

const BACKLOG_KEY = 'backlog';

export function cyclePlanningQueryKey(wsId: string, cycleId: string | null) {
  return ['task-cycle-planning', wsId, cycleId ?? BACKLOG_KEY] as const;
}

export interface MoveCycleTaskInput {
  task: CyclePlanningTask;
  fromCycleId: string | null;
  toCycleId: string | null;
}

interface MoveContext {
  snapshots: [readonly unknown[], CyclePlanningTask[] | undefined][];
}

/**
 * Tasks for one scope (a cycle, or the backlog when `cycleId` is null) and an
 * optimistic move between scopes that rolls back when the write fails.
 */
export function useCyclePlanning({
  wsId,
  cycleId,
  enabled,
  source,
  onMoveError,
}: {
  wsId: string;
  cycleId: string | null;
  enabled: boolean;
  source: CyclePlanningDataSource;
  onMoveError: (error: unknown) => void;
}) {
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: cyclePlanningQueryKey(wsId, cycleId),
    queryFn: () =>
      cycleId
        ? source.listCycleTasks(wsId, cycleId)
        : source.listBacklogTasks(wsId),
    enabled,
  });

  const moveMutation = useMutation<
    void,
    unknown,
    MoveCycleTaskInput,
    MoveContext
  >({
    mutationFn: ({ task, fromCycleId, toCycleId }) =>
      source.moveTask({ wsId, taskId: task.id, fromCycleId, toCycleId }),
    onMutate: async ({ task, fromCycleId, toCycleId }) => {
      const fromKey = cyclePlanningQueryKey(wsId, fromCycleId);
      const toKey = cyclePlanningQueryKey(wsId, toCycleId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: fromKey }),
        queryClient.cancelQueries({ queryKey: toKey }),
      ]);
      const snapshots: MoveContext['snapshots'] = [
        [fromKey, queryClient.getQueryData<CyclePlanningTask[]>(fromKey)],
        [toKey, queryClient.getQueryData<CyclePlanningTask[]>(toKey)],
      ];
      queryClient.setQueryData<CyclePlanningTask[]>(fromKey, (tasks) =>
        tasks?.filter((item) => item.id !== task.id)
      );
      queryClient.setQueryData<CyclePlanningTask[]>(toKey, (tasks) =>
        tasks
          ? [
              ...tasks.filter((item) => item.id !== task.id),
              { ...task, cycle_id: toCycleId },
            ]
          : tasks
      );
      return { snapshots };
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
      onMoveError(error);
    },
    onSettled: (_data, _error, { fromCycleId, toCycleId }) => {
      void queryClient.invalidateQueries({
        queryKey: cyclePlanningQueryKey(wsId, fromCycleId),
      });
      void queryClient.invalidateQueries({
        queryKey: cyclePlanningQueryKey(wsId, toCycleId),
      });
    },
  });

  return { tasksQuery, moveTask: moveMutation.mutate };
}
