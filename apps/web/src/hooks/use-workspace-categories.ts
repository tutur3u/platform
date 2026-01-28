'use client';

import { useQuery } from '@tanstack/react-query';
import type { TimeTrackingCategory } from '@tuturuuu/types';

interface UseWorkspaceCategoriesOptions {
  wsId: string | null;
  enabled?: boolean;
  initialData?: TimeTrackingCategory[] | null;
}

export function useWorkspaceCategories({
  wsId,
  enabled = true,
  initialData,
}: UseWorkspaceCategoriesOptions) {
  return useQuery({
    queryKey: ['workspace-categories', wsId],
    queryFn: async (): Promise<TimeTrackingCategory[]> => {
      if (!wsId) return [];

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/categories`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }
      const data = await response.json();
      return data.categories || [];
    },
    enabled: enabled && !!wsId,
    initialData: initialData ?? undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
