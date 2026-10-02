'use client';

import { useQuery } from '@tanstack/react-query';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import {
  useWorkspaceActor,
  useWorkspaceVisibility,
} from './use-workspace-visibility';

/** UI choices only. Do not use this hook for access or membership reconciliation. */
export function useVisibleWorkspaces(
  enabled = true,
  limit?: number,
  options?: { refetchInterval?: number }
) {
  const actor = useWorkspaceActor();
  const visibility = useWorkspaceVisibility(enabled);
  const query = useQuery({
    queryKey: [
      'workspace-ui-list',
      actor?.actorId,
      ...(limit !== undefined ? [limit] : []),
    ],
    enabled: enabled && Boolean(actor),
    refetchInterval: options?.refetchInterval,
    queryFn: async () => {
      actor!.assertActive();
      const result = await listWorkspaces(
        limit !== undefined ? { limit } : undefined
      );
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
    personalWorkspaceMissing:
      visibility.known &&
      query.data !== undefined &&
      !query.data.some((workspace) => workspace.personal),
    data,
    isLoading:
      enabled &&
      (query.isLoading || (!visibility.known && !visibility.isError)),
    isError: query.isError || visibility.isError,
    error: query.error ?? visibility.error,
    refetch: async () => {
      const visibilityResult = await visibility.refetch();
      return visibilityResult ? query.refetch() : null;
    },
  };
}
