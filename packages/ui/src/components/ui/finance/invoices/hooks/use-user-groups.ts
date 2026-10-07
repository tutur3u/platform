import { useQuery } from '@tanstack/react-query';
import { useWorkspaceActor } from '../../../../../hooks/use-workspace-visibility';
import { listUserGroupsWithInternalApi } from '../internal-api';
import type { UserGroup } from '../utils';
import { invoiceActorLifetimeKey } from './invoice-actor-lifetime-key';

export function useUserGroups(wsId: string, userId: string) {
  const actor = useWorkspaceActor();
  return useQuery({
    queryKey: [
      'user-groups',
      wsId,
      userId,
      actor?.actorId ?? null,
      actor ? invoiceActorLifetimeKey(actor.lifetime) : null,
    ],
    queryFn: async (): Promise<UserGroup[]> => {
      if (!actor) throw new Error('Workspace account unavailable');
      actor.assertActive();
      if (!userId) return [];
      try {
        const groups = await listUserGroupsWithInternalApi(wsId, userId);
        actor.assertActive();
        return (groups || []).map((group) => ({
          workspace_user_groups: group.workspace_user_groups ?? null,
        }));
      } catch (error) {
        actor.assertActive();
        throw error;
      }
    },
    enabled: !!actor && !!wsId && !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
