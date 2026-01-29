'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompleteTaskResponse,
  TunaPet,
  TunaTasksResponse,
} from '../types/tuna';
import { tunaKeys } from './use-tuna';

interface TunaPetResponse {
  pet: TunaPet;
  equipped_accessories: unknown[];
  daily_stats: unknown;
}

// Query keys for tasks
export const tunaTaskKeys = {
  all: ['tuna', 'tasks'] as const,
  list: (wsId?: string, isPersonal?: boolean) =>
    [...tunaTaskKeys.all, 'list', { wsId, isPersonal }] as const,
};

interface FetchTasksParams {
  wsId: string;
  isPersonal: boolean;
}

// Fetch tasks
async function fetchTunaTasks({
  wsId,
  isPersonal,
}: FetchTasksParams): Promise<TunaTasksResponse> {
  const params = new URLSearchParams();
  params.set('wsId', wsId);
  params.set('isPersonal', String(isPersonal));

  const res = await fetch(`/api/v1/tuna/tasks?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Failed to fetch tasks');
  }
  return res.json();
}

// Complete task
async function completeTask(taskId: string): Promise<CompleteTaskResponse> {
  const res = await fetch('/api/v1/tuna/tasks/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to complete task');
  }
  return res.json();
}

interface UseTunaTasksParams {
  wsId: string;
  isPersonal: boolean;
}

/**
 * Hook for fetching user's tasks for the Tuna panel
 */
export function useTunaTasks({ wsId, isPersonal }: UseTunaTasksParams) {
  return useQuery({
    queryKey: tunaTaskKeys.list(wsId, isPersonal),
    queryFn: () => fetchTunaTasks({ wsId, isPersonal }),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook for completing a task from the Tuna panel
 */
export function useCompleteTunaTask({ wsId, isPersonal }: UseTunaTasksParams) {
  const queryClient = useQueryClient();
  const queryKey = tunaTaskKeys.list(wsId, isPersonal);

  return useMutation({
    mutationFn: completeTask,
    onMutate: async (taskId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previousTasks =
        queryClient.getQueryData<TunaTasksResponse>(queryKey);

      // Optimistically remove the task from all categories
      if (previousTasks) {
        queryClient.setQueryData<TunaTasksResponse>(queryKey, {
          ...previousTasks,
          overdue: previousTasks.overdue.filter((t) => t.id !== taskId),
          today: previousTasks.today.filter((t) => t.id !== taskId),
          upcoming: previousTasks.upcoming.filter((t) => t.id !== taskId),
          stats: {
            total: previousTasks.stats.total - 1,
            completed_today: previousTasks.stats.completed_today + 1,
          },
        });
      }

      return { previousTasks };
    },
    onError: (_error, _taskId, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(queryKey, context.previousTasks);
      }
    },
    onSuccess: (data) => {
      // Update pet data if XP was awarded
      if (data.pet) {
        queryClient.setQueryData(
          tunaKeys.pet(),
          (old: TunaPetResponse | undefined) => ({
            ...old,
            pet: data.pet,
          })
        );
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
