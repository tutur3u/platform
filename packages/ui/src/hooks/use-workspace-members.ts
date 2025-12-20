'use client';

import { useQuery } from '@tanstack/react-query';

export interface WorkspaceMember {
  id: string;
  user_id?: string;
  workspace_id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  [key: string]: any;
}

interface UseWorkspaceMembersOptions {
  enabled?: boolean;
}

/**
 * Hook for fetching workspace members with caching and error handling.
 * 
 * Provides a centralized, consistent way to fetch workspace members across
 * the application, ensuring all components use the same endpoint, headers,
 * error behavior, and data shape.
 * 
 * @param workspaceId - The workspace ID to fetch members for
 * @param options - Configuration options
 * @param options.enabled - Whether the query should run (default: true if workspaceId provided)
 * @returns Query result with workspace members data, loading state, and error state
 * 
 * @example
 * const { data: members, isLoading } = useWorkspaceMembers(workspaceId, {
 *   enabled: !!workspaceId && isMultiSelectMode
 * });
 */
export function useWorkspaceMembers(
  workspaceId: string | undefined,
  options: UseWorkspaceMembersOptions = {}
) {
  const { enabled: enabledOption } = options;

  // Determine if query should be enabled
  const isEnabled =
    enabledOption !== undefined ? enabledOption : !!workspaceId;

  return useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async (): Promise<WorkspaceMember[]> => {
      if (!workspaceId) {
        return [];
      }

      const response = await fetch(`/api/workspaces/${workspaceId}/members`);
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }

      const { members: fetchedMembers } = (await response.json()) as {
        members: WorkspaceMember[];
      };

      return fetchedMembers || [];
    },
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - members rarely change
  });
}
