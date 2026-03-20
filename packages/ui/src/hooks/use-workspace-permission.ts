'use client';

import { useQuery } from '@tanstack/react-query';
import { checkWorkspacePermission } from '@tuturuuu/internal-api/settings';
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
  const {
    data: hasPermission,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workspace-permission', wsId, permission, user.id],
    queryFn: async () =>
      (await checkWorkspacePermission(wsId, permission, user.id)).hasPermission,
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
