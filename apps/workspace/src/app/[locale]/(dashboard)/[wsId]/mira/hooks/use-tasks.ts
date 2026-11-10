'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTasksAppUrlClient } from '@/lib/tasks-app-url-client';
import type {
  CompleteTaskResponse,
  MiraPet,
  MiraTasksResponse,
} from '../types/mira';
import { miraKeys } from './use-mira';

interface MiraPetResponse {
  pet: MiraPet;
  equipped_accessories: unknown[];
  daily_stats: unknown;
}

// Query keys for tasks
export const miraTaskKeys = {
  all: ['mira', 'tasks'] as const,
  list: (wsId?: string, isPersonal?: boolean) =>
    [...miraTaskKeys.all, 'list', { wsId, isPersonal }] as const,
};

interface FetchTasksParams {
  wsId: string;
  isPersonal: boolean;
}

// Fetch tasks
async function fetchMiraTasks({
  wsId,
  isPersonal,
}: FetchTasksParams): Promise<MiraTasksResponse> {
  const params = new URLSearchParams();
  params.set('wsId', wsId);
  params.set('isPersonal', String(isPersonal));

  const res = await fetch(
    getTasksAppUrlClient(`/api/v1/mira/tasks?${params.toString()}`),
    {
      cache: 'no-store',
      credentials: 'include',
    }
  );
  if (!res.ok) {
    throw new Error('Failed to fetch tasks');
  }
  return res.json();
}

// Complete task
async function completeTask(taskId: string): Promise<CompleteTaskResponse> {
  const res = await fetch(getTasksAppUrlClient('/api/v1/mira/tasks/complete'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to complete task');
  }
  return res.json();
}

interface UseMiraTasksParams {
  wsId: string;
  isPersonal: boolean;
}

/**
 * Hook for fetching user's tasks for the Mira panel
 */
export function useMiraTasks({ wsId, isPersonal }: UseMiraTasksParams) {
  return useQuery({
    queryKey: miraTaskKeys.list(wsId, isPersonal),
    queryFn: () => fetchMiraTasks({ wsId, isPersonal }),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook for completing a task from the Mira panel
 */
export function useCompleteMiraTask({ wsId, isPersonal }: UseMiraTasksParams) {
  const queryClient = useQueryClient();
  const queryKey = miraTaskKeys.list(wsId, isPersonal);

  return useMutation({
    mutationFn: completeTask,
    onMutate: async (taskId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot previous value
      const previousTasks =
        queryClient.getQueryData<MiraTasksResponse>(queryKey);

      // Optimistically remove the task from all categories
      if (previousTasks) {
        queryClient.setQueryData<MiraTasksResponse>(queryKey, {
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
          miraKeys.pet(),
          (old: MiraPetResponse | undefined) => ({
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
