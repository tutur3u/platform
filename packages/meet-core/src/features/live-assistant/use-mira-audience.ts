'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMiraAudienceAttestation,
  type MiraAudienceAttestation,
  updateMiraAudienceAttestation,
} from '@tuturuuu/internal-api/workspace-configs';
import { useVisibleWorkspaces } from '@tuturuuu/ui/hooks/use-visible-workspaces';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';

/** Tab of the meeting settings dialog that holds the workspace 18+ switch. */
export const MIRA_SETTINGS_TAB = 'mira';

type MiraAudience = MiraAudienceAttestation & {
  /** A write was refused, so only the workspace owner may change the setting. */
  ownerOnly?: boolean;
};

const audienceKey = (wsId: string | undefined) => [
  'meet-mira-audience',
  wsId ?? '',
];

/**
 * Queries that say whether Mira is available in a meeting: the Private Mira
 * policy (private-notice.tsx) and the room Mira notice (room-mira-notice.tsx).
 * They are read again once the workspace setting changes.
 */
const AVAILABILITY_KEYS = [['mira-private-choice'], ['room-mira-consent']];

function statusOf(error: unknown) {
  return error && typeof error === 'object' && 'status' in error
    ? Number(error.status)
    : Number.NaN;
}

/**
 * The workspace 18+ declaration that turns Mira on, as far as this viewer may
 * see it. Only the workspace owner may change it. The viewer's workspace list
 * says who that is; someone it names as not the owner is read-only and the
 * setting is not requested for them.
 *
 * Where the list cannot tell (no account scope, or the workspace is not in
 * it), the setting itself decides. Its read answers only people who manage
 * workspace settings, so a refused read is read-only, and a refused write is
 * remembered as `ownerOnly`, because the read does not reveal the owner.
 */
export function useMiraAudience(wsId: string | undefined) {
  const client = useQueryClient();
  const key = audienceKey(wsId);
  const actor = useWorkspaceActor();
  const workspaces = useVisibleWorkspaces(!!wsId);
  // Without an account scope the list never loads, so nothing waits on it.
  const listPending = !!actor && workspaces.isLoading;
  const owner = workspaces.data?.find(
    (workspace) => workspace.id === wsId
  )?.created_by_me;
  const query = useQuery({
    queryKey: key,
    enabled: !!wsId && !listPending && owner !== false,
    retry: false,
    // A refusal is the expected answer for most people; do not repeat it on
    // every return to the tab. Each surface still reads when it opens.
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<MiraAudience> => ({
      ...(await getMiraAudienceAttestation(wsId as string)),
      // Reading the setting again cannot disprove an earlier refused write.
      ownerOnly: client.getQueryData<MiraAudience>(key)?.ownerOnly,
    }),
  });
  const refused = statusOf(query.error) === 403;
  const ownerOnly = query.data?.ownerOnly === true;
  const known = query.data !== undefined && !refused;
  return {
    /** The stored declaration, present only for people who may read it. */
    attested: known ? query.data?.attested : undefined,
    attestedAt: known ? query.data?.attestedAt : undefined,
    canManage: owner !== false && known && !ownerOnly,
    /** Set after this viewer's own change was refused. */
    ownerOnly,
    /** The viewer may not change the setting. */
    readOnly: owner === false || refused || ownerOnly,
    failed: query.isError && !refused && query.data === undefined,
    retry: () => void query.refetch(),
  };
}

/**
 * Declares or withdraws the workspace 18+ audience. The switch moves at once;
 * a failed write restores the stored value and calls `onFailed`, except for a
 * refusal, which marks the setting owner-only instead.
 */
export function useSetMiraAudience(wsId: string, onFailed: () => void) {
  const client = useQueryClient();
  const key = audienceKey(wsId);
  return useMutation({
    mutationFn: (attested: boolean) =>
      updateMiraAudienceAttestation(wsId, attested),
    onMutate: async (attested) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<MiraAudience>(key);
      client.setQueryData<MiraAudience>(key, {
        attested,
        attestedAt: null,
        attestedByCurrentUser: attested,
      });
      return { previous };
    },
    onError: (error, _attested, context) => {
      const ownerOnly = statusOf(error) === 403;
      if (context?.previous)
        client.setQueryData<MiraAudience>(key, {
          ...context.previous,
          ownerOnly: ownerOnly || context.previous.ownerOnly,
        });
      else void client.invalidateQueries({ queryKey: key });
      if (!ownerOnly) onFailed();
    },
    onSuccess: (saved) => {
      client.setQueryData<MiraAudience>(key, saved);
      for (const queryKey of AVAILABILITY_KEYS)
        void client.invalidateQueries({ queryKey });
    },
  });
}
