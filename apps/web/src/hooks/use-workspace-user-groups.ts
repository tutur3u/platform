import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';

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
      const supabase = createClient();

      if (includeGuest) {
        const { data, error } = await supabase
          .from('workspace_user_groups')
          .select('id, name, archived, is_guest')
          .eq('ws_id', wsId)
          .order('name', { ascending: true });

        if (error) {
          console.error('Error fetching workspace user groups:', error);
          throw error;
        }

        return (data || []) as WorkspaceUserGroupWithGuest[];
      } else {
        const { data, error } = await supabase
          .from('workspace_user_groups')
          .select('id, name, archived')
          .eq('ws_id', wsId)
          .order('name', { ascending: true });

        if (error) {
          console.error('Error fetching workspace user groups:', error);
          throw error;
        }

        return (data || []) as WorkspaceUserGroup[];
      }
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
