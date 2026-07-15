import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceLabel,
  deleteWorkspaceLabel,
  listWorkspaceLabels,
  updateWorkspaceLabel,
} from '@tuturuuu/internal-api/tasks';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { TaskLabel } from '../types';

interface UseTaskLabelsProps {
  wsId: string;
  initialLabels: TaskLabel[];
}

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

export function useTaskLabels({ wsId, initialLabels }: UseTaskLabelsProps) {
  const t = useTranslations('ws-tasks-labels');
  const queryClient = useQueryClient();
  const queryKey = ['task-labels', wsId];

  const { data: labels = initialLabels } = useQuery({
    queryKey,
    queryFn: async () =>
      listWorkspaceLabels(wsId, getBrowserInternalApiOptions()),
    initialData: initialLabels,
  });

  const { mutateAsync: createLabelMutation, isPending: isCreating } =
    useMutation({
      mutationFn: async (data: { name: string; color: string }) => {
        return createWorkspaceLabel(
          wsId,
          {
            name: data.name.trim(),
            color: data.color,
          },
          getBrowserInternalApiOptions()
        );
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
      }: {
        id: string;
        name: string;
        color: string;
      }) => {
        return updateWorkspaceLabel(
          wsId,
          id,
          {
            name: data.name.trim(),
            color: data.color,
          },
          getBrowserInternalApiOptions()
        );
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
        await deleteWorkspaceLabel(
          wsId,
          labelId,
          getBrowserInternalApiOptions()
        );
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
