'use client';

import { useQuery } from '@tanstack/react-query';
import { checkWorkspacePermission } from '@tuturuuu/internal-api/settings';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';

type SprintMutationPermission = 'create_task_sprints' | 'delete_task_sprints';

/** Authorize sprint mutations for the verified workspace actor. */
export function useBoardSprintPermissions({
  canEdit,
  enabled = true,
  wsId,
}: {
  canEdit: boolean;
  enabled?: boolean;
  wsId: string;
}) {
  const actor = useWorkspaceActor();
  const canRequest =
    canEdit && enabled && Boolean(wsId) && actor?.lifetime.active === true;
  const permissionOptions = (permission: SprintMutationPermission) => ({
    queryKey: ['workspace-permission', wsId, permission, actor?.actorId],
    queryFn: async () => {
      if (!actor) throw new Error('Workspace actor is unavailable');
      actor.assertActive();
      const result = await checkWorkspacePermission(wsId, permission);
      actor.assertActive();
      return result.hasPermission && result.membershipType === 'MEMBER';
    },
    enabled: canRequest,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const create = useQuery(permissionOptions('create_task_sprints'));
  const remove = useQuery(permissionOptions('delete_task_sprints'));

  return {
    canCreate:
      canRequest &&
      create.isSuccess &&
      !create.isFetching &&
      !create.error &&
      create.data === true,
    canDelete:
      canRequest &&
      remove.isSuccess &&
      !remove.isFetching &&
      !remove.error &&
      remove.data === true,
  };
}

/** Resolve the member board-edit capability independently of UI readiness. */
export function useBoardEditPermission({
  enabled,
  wsId,
}: {
  enabled: boolean;
  wsId: string;
}) {
  const actor = useWorkspaceActor();
  const canRequest =
    enabled && Boolean(wsId) && actor?.lifetime.active === true;
  const permission = useQuery({
    queryKey: ['workspace-permission', wsId, 'manage_projects', actor?.actorId],
    queryFn: async () => {
      if (!actor) throw new Error('Workspace actor is unavailable');
      actor.assertActive();
      const result = await checkWorkspacePermission(wsId, 'manage_projects');
      actor.assertActive();
      return result.hasPermission && result.membershipType === 'MEMBER';
    },
    enabled: canRequest,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return (
    canRequest &&
    permission.isSuccess &&
    !permission.isFetching &&
    !permission.error &&
    permission.data === true
  );
}
