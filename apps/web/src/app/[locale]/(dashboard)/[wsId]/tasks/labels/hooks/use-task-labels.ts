import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { TaskLabel } from '../types';

interface UseTaskLabelsProps {
  wsId: string;
  initialLabels: TaskLabel[];
}

export function useTaskLabels({ wsId, initialLabels }: UseTaskLabelsProps) {
  const t = useTranslations('ws-tasks-labels');
  const queryClient = useQueryClient();
  const queryKey = ['task-labels', wsId];

  const { data: labels = initialLabels } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      return response.json() as Promise<TaskLabel[]>;
    },
    initialData: initialLabels,
  });

  const { mutateAsync: createLabelMutation, isPending: isCreating } =
    useMutation({
      mutationFn: async (data: { name: string; color: string }) => {
        const response = await fetch(`/api/v1/workspaces/${wsId}/labels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.name.trim(),
            color: data.color,
          }),
        });

        if (!response.ok) throw new Error('Failed to create label');
        return response.json() as Promise<TaskLabel>;
      },
      onMutate: async (newLabel) => {
        await queryClient.cancelQueries({ queryKey });
        const previousLabels = queryClient.getQueryData<TaskLabel[]>(queryKey);

        const optimisticLabel: TaskLabel = {
          id: `temp-${Date.now()}`,
          name: newLabel.name.trim(),
          color: newLabel.color,
          ws_id: wsId,
          created_at: new Date().toISOString(),
          creator_id: null,
        };

        queryClient.setQueryData<TaskLabel[]>(queryKey, (old) => [
          optimisticLabel,
          ...(old || []),
        ]);

        return { previousLabels };
      },
      onError: (_err, _newLabel, context) => {
        if (context?.previousLabels) {
          queryClient.setQueryData(queryKey, context.previousLabels);
        }
        toast.error(t('error_create'));
      },
      onSuccess: () => {
        toast.success(t('success_create'));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    });

  const { mutateAsync: updateLabelMutation, isPending: isUpdating } =
    useMutation({
      mutationFn: async ({
        id,
        ...data
      }: { id: string; name: string; color: string }) => {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/labels/${id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: data.name.trim(),
              color: data.color,
            }),
          }
        );

        if (!response.ok) throw new Error('Failed to update label');
        return response.json() as Promise<TaskLabel>;
      },
      onMutate: async ({ id, ...data }) => {
        await queryClient.cancelQueries({ queryKey });
        const previousLabels = queryClient.getQueryData<TaskLabel[]>(queryKey);

        queryClient.setQueryData<TaskLabel[]>(queryKey, (old) =>
          (old || []).map((label) =>
            label.id === id
              ? { ...label, name: data.name.trim(), color: data.color }
              : label
          )
        );

        return { previousLabels };
      },
      onError: (_err, _variables, context) => {
        if (context?.previousLabels) {
          queryClient.setQueryData(queryKey, context.previousLabels);
        }
        toast.error(t('error_update'));
      },
      onSuccess: () => {
        toast.success(t('success_update'));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    });

  const { mutateAsync: deleteLabelMutation, isPending: isDeleting } =
    useMutation({
      mutationFn: async (labelId: string) => {
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/labels/${labelId}`,
          {
            method: 'DELETE',
          }
        );

        if (!response.ok) throw new Error('Failed to delete label');
      },
      onMutate: async (labelId) => {
        await queryClient.cancelQueries({ queryKey });
        const previousLabels = queryClient.getQueryData<TaskLabel[]>(queryKey);

        queryClient.setQueryData<TaskLabel[]>(queryKey, (old) =>
          (old || []).filter((label) => label.id !== labelId)
        );

        return { previousLabels };
      },
      onError: (_err, _labelId, context) => {
        if (context?.previousLabels) {
          queryClient.setQueryData(queryKey, context.previousLabels);
        }
        toast.error(t('error_delete'));
      },
      onSuccess: () => {
        toast.success(t('success_delete'));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey });
      },
    });

  return {
    labels,
    isSubmitting: isCreating || isUpdating || isDeleting,
    createLabel: createLabelMutation,
    updateLabel: (labelId: string, data: { name: string; color: string }) =>
      updateLabelMutation({ id: labelId, ...data }),
    deleteLabel: deleteLabelMutation,
  };
}
