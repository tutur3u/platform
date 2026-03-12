import { useQuery } from '@tanstack/react-query';

export interface WorkspaceUserGroup {
  id: string;
  name: string;
  archived: boolean | null;
}

export interface WorkspaceUserGroupWithGuest extends WorkspaceUserGroup {
  is_guest: boolean | null;
}

interface UseWorkspaceUserGroupsOptions {
  /**
   * Whether to include the `is_guest` field in the query
   * @default false
   */
  includeGuest?: boolean;
}

/**
 * Fetches workspace user groups for a given workspace (with is_guest field)
 *
 * @param wsId - Workspace ID
 * @param options - Query options with includeGuest set to true
 * @returns Query result with workspace user groups including is_guest field
 */
export function useWorkspaceUserGroups(
  wsId: string,
  options: { includeGuest: true }
): ReturnType<typeof useQuery<WorkspaceUserGroupWithGuest[], Error>>;

/**
 * Fetches workspace user groups for a given workspace (without is_guest field)
 *
 * @param wsId - Workspace ID
 * @param options - Query options with includeGuest set to false or undefined
 * @returns Query result with workspace user groups
 */
export function useWorkspaceUserGroups(
  wsId: string,
  options?: { includeGuest?: false }
): ReturnType<typeof useQuery<WorkspaceUserGroup[], Error>>;

/**
 * @example
 * ```tsx
 * // Basic usage without is_guest field
 * const { data, isLoading, error } = useWorkspaceUserGroups(wsId);
 *
 * // With is_guest field
 * const { data, isLoading, error } = useWorkspaceUserGroups(wsId, { includeGuest: true });
 * ```
 */
export function useWorkspaceUserGroups(
  wsId: string,
  options?: UseWorkspaceUserGroupsOptions
) {
  const { includeGuest = false } = options || {};

  return useQuery({
    queryKey: ['workspace-user-groups', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/groups?page=1&pageSize=200`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace user groups');
      }

      const payload = (await response.json()) as {
        data?: WorkspaceUserGroupWithGuest[];
      };
      const groups = payload.data ?? [];

      return includeGuest
        ? groups
        : groups.map(({ is_guest: _isGuest, ...group }) => group);
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
