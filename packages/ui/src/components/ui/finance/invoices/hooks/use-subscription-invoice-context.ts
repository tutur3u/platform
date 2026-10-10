import { useQuery } from '@tanstack/react-query';
import {
  getSubscriptionInvoiceContext,
  type SubscriptionInvoiceContextResponse,
} from '@tuturuuu/internal-api/finance';
import { useWorkspaceActor } from '../../../../../hooks/use-workspace-visibility';

import { invoiceActorLifetimeKey } from './invoice-actor-lifetime-key';

export function useSubscriptionInvoiceContext(
  wsId: string,
  userId: string,
  groupIds: string[],
  month: string,
  monthCount = 1
) {
  const actor = useWorkspaceActor();
  return useQuery({
    queryKey: [
      'subscription-invoice-context',
      wsId,
      userId,
      groupIds,
      month,
      monthCount,
      actor?.actorId ?? null,
      actor ? invoiceActorLifetimeKey(actor.lifetime) : null,
    ],
    queryFn: async (): Promise<SubscriptionInvoiceContextResponse> => {
      if (!actor) throw new Error('Workspace account unavailable');
      actor.assertActive();
      if (!wsId || !userId || groupIds.length === 0 || !month) {
        return {
          attendance: [],
          latestInvoices: [],
          scheduledSessionsByGroupId: {},
        };
      }
      try {
        const response = await getSubscriptionInvoiceContext(wsId, {
          groupIds,
          month,
          monthCount,
          userId,
        });
        actor.assertActive();
        return response;
      } catch (error) {
        actor.assertActive();
        throw error;
      }
    },
    enabled: !!actor && !!wsId && !!userId && groupIds.length > 0 && !!month,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
