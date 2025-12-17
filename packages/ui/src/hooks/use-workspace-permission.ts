'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { PermissionId } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

interface UseWorkspacePermissionOptions {
  wsId: string;
  permission: PermissionId;
  enabled?: boolean;
  user: WorkspaceUser;
}

interface UseWorkspacePermissionReturn {
  hasPermission: boolean | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to check if the current user has a specific workspace permission.
 *
 * Uses TanStack Query for caching and automatic refetching.
 * Results are cached for 5 minutes.
 *
 * @example
 * const { hasPermission, isLoading } = useWorkspacePermission({
 *   wsId: workspace.id,
 *   permission: 'manage_workspace_settings',
 * });
 *
 * if (isLoading) return <Spinner />;
 * if (!hasPermission) return <PermissionDenied />;
 * return <AdminPanel />;
 */
export function useWorkspacePermission({
  wsId,
  permission,
  enabled = true,
  user,
}: UseWorkspacePermissionOptions): UseWorkspacePermissionReturn {
  const supabase = createClient();

  const {
    data: hasPermission,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workspace-permission', wsId, permission, user.id],
    queryFn: async () => {

      // Explicit "no user" case: user is unauthenticated (not a transient error)
      // Check permission via RPC – throw on error (transient failures surface properly)
      const { data, error: rpcError } = await supabase.rpc(
        'has_workspace_permission',
        {
          p_user_id: user.id,
          p_ws_id: wsId,
          p_permission: permission,
        }
      );

      if (rpcError) {
        throw new Error(
          `Failed to check workspace permission: ${rpcError.message}`
        );
      }

      return data ?? false;
    },
    enabled: enabled && !!wsId && !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1, // Retry once on failure
  });

  return {
    hasPermission,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
