'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import {
  useWorkspaceActor,
  useWorkspaceVisibility,
} from './use-workspace-visibility';

/** UI choices only. Do not use this hook for access or membership reconciliation. */
export function useVisibleWorkspaces(enabled = true) {
  const actor = useWorkspaceActor();
  const visibility = useWorkspaceVisibility();
  const query = useQuery({
    queryKey: ['workspace-ui-list', actor?.actorId],
    enabled: enabled && Boolean(actor),
    queryFn: async () => {
      actor!.assertActive();
      const result = await listWorkspaces();
      actor!.assertActive();
      return result;
    },
  });
  const data = visibility.known
    ? query.data?.filter(
        (workspace) => !visibility.hiddenIds.includes(workspace.id)
      )
    : undefined;
  return {
    ...query,
    data,
    isLoading: query.isLoading || !visibility.known,
    error: query.error ?? visibility.error,
    refetch: async () => {
      await visibility.refetch();
      return query.refetch();
    },
  };
}
