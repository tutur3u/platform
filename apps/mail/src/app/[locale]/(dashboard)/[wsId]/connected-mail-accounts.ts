'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type ConnectedMailAccount,
  connectedMailRequest,
} from '@tuturuuu/internal-api';
import { useMailActor } from '@/components/mail-actor-provider';

export function connectedMailCacheScope(
  workspaceId: string,
  actorId: string | null
) {
  return ['connected-mail', workspaceId, actorId] as const;
}

/** One shared accounts query for the sidebar picker, the pane and settings. */
export function useConnectedMailAccounts(workspaceId: string) {
  const actorId = useMailActor();
  const cacheScope = connectedMailCacheScope(workspaceId, actorId);
  const query = useQuery({
    queryKey: [...cacheScope, 'accounts'],
    queryFn: () =>
      connectedMailRequest<ConnectedMailAccount[]>(workspaceId, []),
    staleTime: 30_000,
  });
  return { actorId, cacheScope, query };
}
