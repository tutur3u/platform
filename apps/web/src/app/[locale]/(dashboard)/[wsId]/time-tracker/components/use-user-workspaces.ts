'use client';

import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types';

interface UseUserWorkspacesOptions {
  enabled?: boolean;
}

export function useUserWorkspaces({ enabled = true }: UseUserWorkspacesOptions = {}) {
  return useQuery<Workspace[]>({
    queryKey: ['user-workspaces'],
    queryFn: async () => {
      const response = await fetch('/api/v1/workspaces');
      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }
      return response.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
