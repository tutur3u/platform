'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMiraAudienceAttestation,
  type MiraAudienceAttestation,
  updateMiraAudienceAttestation,
} from '@tuturuuu/internal-api/workspace-configs';
import { getWorkspace } from '@tuturuuu/internal-api/workspaces';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';

export const MIRA_SETTINGS_TAB = 'mira';

type MiraAudience =
  | { kind: 'owner'; setting: MiraAudienceAttestation }
  | { kind: 'read-only' };

const audienceKey = (actorId: string | undefined, wsId: string | undefined) => [
  'meet-mira-audience',
  actorId,
  wsId,
];

function isRefusal(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 403
  );
}

export function useMiraAudience(wsId: string | undefined) {
  const actor = useWorkspaceActor();
  const query = useQuery({
    queryKey: audienceKey(actor?.actorId, wsId),
    enabled: !!actor && !!wsId,
    retry: false,
    queryFn: async (): Promise<MiraAudience> => {
      if (!actor || !wsId) return { kind: 'read-only' };
      actor.assertActive();
      const workspace = await getWorkspace(wsId);
      actor.assertActive();
      if (workspace.deleted || workspace.creator_id !== actor.actorId)
        return { kind: 'read-only' };
      const setting = await getMiraAudienceAttestation(wsId);
      actor.assertActive();
      return { kind: 'owner', setting };
    },
  });
  const readOnly =
    !actor || query.data?.kind === 'read-only' || isRefusal(query.error);
  return {
    setting:
      !readOnly && !query.isError && query.data?.kind === 'owner'
        ? query.data.setting
        : undefined,
    readOnly,
    failed: query.isError && !readOnly,
    retry: () => void query.refetch(),
  };
}

export function useSetMiraAudience(wsId: string, onFailed: () => void) {
  const actor = useWorkspaceActor();
  const client = useQueryClient();
  const key = audienceKey(actor?.actorId, wsId);
  return useMutation({
    scope: { id: JSON.stringify(key) },
    mutationFn: async (attested: boolean) => {
      if (!actor || client.getQueryData<MiraAudience>(key)?.kind !== 'owner')
        throw new Error('Workspace owner permission required');
      actor.assertActive();
      const saved = await updateMiraAudienceAttestation(wsId, attested);
      actor.assertActive();
      return saved;
    },
    onError: (error) => {
      if (!actor?.lifetime.active) return;
      if (isRefusal(error)) {
        client.setQueryData<MiraAudience>(key, { kind: 'read-only' });
        return;
      }
      onFailed();
    },
    onSuccess: (setting) => {
      if (!actor?.lifetime.active) return;
      client.setQueryData<MiraAudience>(key, { kind: 'owner', setting });
      void client.invalidateQueries({ queryKey: ['mira-private-choice'] });
      void client.invalidateQueries({ queryKey: ['room-mira-consent'] });
    },
  });
}
