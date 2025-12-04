import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { toast } from '@tuturuuu/ui/sonner';

export interface CalendarCategory {
  id: string;
  ws_id: string;
  name: string;
  color: SupportedColor;
  position: number;
  created_at: string | null;
  updated_at: string | null;
}

interface UseCalendarCategoriesOptions {
  workspaceId: string | undefined;
}

export function useCalendarCategories({
  workspaceId,
}: UseCalendarCategoriesOptions) {
  const queryClient = useQueryClient();
  const queryKey = ['calendar-categories', workspaceId];

  // Query for fetching categories
  const categoriesQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/calendar/categories`
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch categories');
      }
      const data = await res.json();
      return data.categories as CalendarCategory[];
    },
    enabled: !!workspaceId,
    staleTime: 30000,
  });

  // Mutation for creating category
  const createMutation = useMutation({
    mutationFn: async (category: { name: string; color: string }) => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/calendar/categories`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(category),
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create category');
      }
      return res.json();
    },
    onMutate: async (newCategory) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKey);

      // Optimistic update
      const optimisticCategory: CalendarCategory = {
        id: `temp-${Date.now()}`,
        ws_id: workspaceId!,
        name: newCategory.name,
        color: newCategory.color as SupportedColor,
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
    onError: (err, _, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Mutation for updating category
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      color?: string;
    }) => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/calendar/categories/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update category');
      }
      return res.json();
    },
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
                color: (updated.color as SupportedColor) ?? cat.color,
                updated_at: new Date().toISOString(),
              }
            : cat
        )
      );

      return { previous };
    },
    onError: (err, _, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Mutation for deleting category
  const deleteMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/calendar/categories/${categoryId}`,
        {
          method: 'DELETE',
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete category');
      }
      return res.json();
    },
    onMutate: async (categoryId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CalendarCategory[]>(queryKey);

      // Optimistic update
      queryClient.setQueryData<CalendarCategory[]>(queryKey, (old) =>
        old?.filter((cat) => cat.id !== categoryId)
      );

      return { previous };
    },
    onError: (err, _, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Mutation for reordering categories
  const reorderMutation = useMutation({
    mutationFn: async (categories: Array<{ id: string; position: number }>) => {
      const res = await fetch(
        `/api/v1/workspaces/${workspaceId}/calendar/categories/reorder`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categories }),
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to reorder categories');
      }
      return res.json();
    },
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
          .sort((a, b) => a.position - b.position);
      });

      return { previous };
    },
    onError: (err, _, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    categories: categoriesQuery.data ?? [],
    isLoading: categoriesQuery.isLoading,
    isError: categoriesQuery.isError,
    error: categoriesQuery.error,
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
