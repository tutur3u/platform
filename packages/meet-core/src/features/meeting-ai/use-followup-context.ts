'use client';
import { useQuery } from '@tanstack/react-query';
import { getMeetFollowupContext } from '@tuturuuu/internal-api';
import {
  useWorkspaceActor,
  useWorkspaceVisibility,
} from '@tuturuuu/ui/hooks/use-workspace-visibility';
export function useFollowupContext(wsId: string, meetingId: string) {
  const actor = useWorkspaceActor();
  const visibility = useWorkspaceVisibility();
  const query = useQuery({
    queryKey: [
      'workspace-ui-list',
      actor?.actorId,
      'meet-followup-context',
      wsId,
      meetingId,
    ],
    enabled: !!actor,
    queryFn: async () => {
      actor!.assertActive();
      const result = await getMeetFollowupContext(wsId, meetingId);
      actor!.assertActive();
      return result;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  return {
    profile: { ...query, data: query.data?.user },
    workspaces: {
      ...query,
      error: query.error ?? visibility.error,
      isError: query.isError || visibility.isError,
      data: visibility.known
        ? query.data?.workspaces.filter(
            (workspace) => !visibility.hiddenIds.includes(workspace.id)
          )
        : undefined,
    },
    settings: {
      ...query,
      data: query.data ? { timezone: query.data.timezone } : undefined,
    },
  };
}
