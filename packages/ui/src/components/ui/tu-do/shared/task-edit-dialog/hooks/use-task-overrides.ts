'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskUserOverride } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';

type OverrideInput = Partial<
  Omit<TaskUserOverride, 'task_id' | 'user_id' | 'created_at' | 'updated_at'>
>;

export function useTaskOverrides(taskId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['task-override', taskId];

  const {
    data: override,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: async (): Promise<TaskUserOverride | null> => {
      if (!taskId) return null;
      const res = await fetch(`/api/v1/users/me/tasks/${taskId}/overrides`);
      if (!res.ok) throw new Error('Failed to fetch override');
      const json = await res.json();
      return json.data ?? null;
    },
    enabled: !!taskId,
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (input: OverrideInput): Promise<TaskUserOverride> => {
      if (!taskId) throw new Error('No task ID');
      const res = await fetch(`/api/v1/users/me/tasks/${taskId}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to save override');
      }
      const json = await res.json();
      return json.data;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskUserOverride | null>(
        queryKey
      );
      // Optimistic update
      queryClient.setQueryData<TaskUserOverride | null>(queryKey, (old) => ({
        task_id: taskId ?? '',
        user_id: '',
        self_managed: false,
        completed_at: null,
        priority_override: null,
        due_date_override: null,
        estimation_override: null,
        personally_unassigned: false,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...old,
        ...input,
      }));
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error('Failed to save personal override');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error('No task ID');
      const res = await fetch(`/api/v1/users/me/tasks/${taskId}/overrides`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete override');
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskUserOverride | null>(
        queryKey
      );
      queryClient.setQueryData(queryKey, null);
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error('Failed to remove override');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    override,
    isLoading,
    error,
    upsert: upsertMutation.mutate,
    upsertAsync: upsertMutation.mutateAsync,
    remove: deleteMutation.mutate,
    isSaving: upsertMutation.isPending || deleteMutation.isPending,
  };
}
