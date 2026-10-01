'use client';

import { useQuery } from '@tanstack/react-query';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { useWorkspaceActor } from './use-workspace-visibility';

/**
 * Hook to fetch the current workspace user with their private details
 * Uses React Query for client-side caching and state management
 *
 * @returns Query object with user data, loading state, and error info
 */
export function useWorkspaceUser(actorId?: string) {
  const actor = useWorkspaceActor();
  const resolvedActorId = actorId ?? actor?.actorId;
  const query = useQuery({
    queryKey: ['workspace-user', resolvedActorId],
    enabled: Boolean(actor) && actor?.actorId === resolvedActorId,
    queryFn: async (): Promise<WorkspaceUser> => {
      actor!.assertActive();
      const data = await getCurrentUserProfile();
      actor!.assertActive();
      if (data.id !== resolvedActorId)
        throw new Error('Workspace account changed');
      return {
        id: data.id,
        email: data.email,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
        full_name: data.full_name,
        created_at: data.created_at,
        new_email: data.new_email,
        default_workspace_id: data.default_workspace_id,
      } as WorkspaceUser;
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep cached data for 10 minutes
    retry: 1, // Retry once on failure
  });
  return {
    ...query,
    data: actor?.actorId === resolvedActorId ? query.data : undefined,
  };
}
