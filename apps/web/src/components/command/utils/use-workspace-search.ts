'use client';

import { useQuery } from '@tanstack/react-query';

export interface WorkspaceSearchResult {
  id: string;
  name: string;
  personal: boolean;
  role: string;
}

/**
 * Hook for fetching user workspaces
 */
export function useWorkspaceSearch(enabled: boolean) {
  const workspacesQuery = useQuery({
    queryKey: ['command-palette-workspaces'],
    queryFn: async () => {
      const response = await fetch('/api/v1/workspaces');

      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }

      const data = await response.json();
      return (data || []) as WorkspaceSearchResult[];
    },
    enabled,
    staleTime: 60000, // 60 seconds
  });

  return {
    workspaces: workspacesQuery.data || [],
    isLoading: workspacesQuery.isLoading,
    error: workspacesQuery.error,
  };
}
