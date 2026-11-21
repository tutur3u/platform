import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CalendarCategory as CalendarCategoryResponse,
  createWorkspaceCalendarCategory,
  deleteWorkspaceCalendarCategory,
  listWorkspaceCalendarCategories,
  reorderWorkspaceCalendarCategories,
  updateWorkspaceCalendarCategory,
} from '@tuturuuu/internal-api/calendar';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

export type CalendarCategory = CalendarCategoryResponse;

const EMPTY_CATEGORIES: CalendarCategory[] = [];

function requireWorkspace(workspaceId: string | undefined) {
  if (!workspaceId) throw new Error('Workspace is required');
  return workspaceId;
}

interface UseCalendarCategoriesOptions {
  workspaceId: string | undefined;
}

export function useCalendarCategories({
  workspaceId,
}: UseCalendarCategoriesOptions) {
  const t = useTranslations('calendar_settings');
  const queryClient = useQueryClient();
  const queryKey = ['calendar-categories', workspaceId];

  // Query for fetching categories
  const categoriesQuery = useQuery({
    queryKey,
    queryFn: async () =>
      (await listWorkspaceCalendarCategories(requireWorkspace(workspaceId)))
        .categories,
    enabled: !!workspaceId,
    staleTime: 30000,
  });

  // Mutation for creating category
  const createMutation = useMutation({
    mutationFn: (category: { name: string; color: SupportedColor }) =>
      createWorkspaceCalendarCategory(requireWorkspace(workspaceId), category),
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKey);

      // Optimistic update
      const optimisticCategory: CalendarCategory = {
        id: `temp-${Date.now()}`,
        ws_id: workspaceId,
        name: newCategory.name,
        color: newCategory.color,
        position: previous?.length ?? 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<CalendarCategory[]>(queryKey, (old) => [
        ...(old || []),
        optimisticCategory,
      ]);

      return { previous };
    },
    onError: (_error, _, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(t('categories.create_failed'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Mutation for updating category
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name: string;
      color: CalendarCategory['color'];
    }) =>
      updateWorkspaceCalendarCategory(requireWorkspace(workspaceId), id, data),
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKey);

      // Optimistic update
      queryClient.setQueryData<CalendarCategory[]>(queryKey, (old) =>
        old?.map((cat) =>
          cat.id === updated.id
            ? {
                ...cat,
                name: updated.name ?? cat.name,
                color: updated.color,
                updated_at: new Date().toISOString(),
              }
            : cat
        )
      );

      return { previous };
    },
    onError: (_error, _, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(t('categories.update_failed'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Mutation for deleting category
  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) =>
      deleteWorkspaceCalendarCategory(
        requireWorkspace(workspaceId),
        categoryId
      ),
    onMutate: async (categoryId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKey);

      // Optimistic update
      queryClient.setQueryData<CalendarCategory[]>(queryKey, (old) =>
        old?.filter((cat) => cat.id !== categoryId)
      );

      return { previous };
    },
    onError: (_error, _, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(t('categories.delete_failed'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Mutation for reordering categories
  const reorderMutation = useMutation({
    mutationFn: (categories: Array<{ id: string; position: number }>) =>
      reorderWorkspaceCalendarCategories(requireWorkspace(workspaceId), {
        categories,
      }),
    onMutate: async (reorderedItems) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKey);

      // Optimistic update - apply new positions
      queryClient.setQueryData<CalendarCategory[]>(queryKey, (old) => {
        if (!old) return old;
        const positionMap = new Map(
          reorderedItems.map((i) => [i.id, i.position])
        );
        return old
          .map((cat) => ({
            ...cat,
            position: positionMap.get(cat.id) ?? cat.position,
          }))
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      });

      return { previous };
    },
    onError: (_error, _, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(t('categories.reorder_failed'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    categories: categoriesQuery.data ?? EMPTY_CATEGORIES,
    isLoading: categoriesQuery.isLoading,
    isError: categoriesQuery.isError,
    retry: categoriesQuery.refetch,
    createCategory: createMutation.mutate,
    updateCategory: updateMutation.mutate,
    deleteCategory: deleteMutation.mutate,
    reorderCategories: reorderMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isReordering: reorderMutation.isPending,
    isMutating:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      reorderMutation.isPending,
  };
}
