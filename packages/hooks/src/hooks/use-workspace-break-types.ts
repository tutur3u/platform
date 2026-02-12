import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@tuturuuu/types';

export type WorkspaceBreakType = Tables<'workspace_break_types'>;

export function useWorkspaceBreakTypes(wsId: string | null) {
  return useQuery({
    queryKey: ['workspace-break-types', wsId],
    queryFn: async () => {
      if (!wsId) return null;

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/break-types`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch break types');
      }

      const data = await response.json();
      return data.breakTypes as WorkspaceBreakType[];
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
