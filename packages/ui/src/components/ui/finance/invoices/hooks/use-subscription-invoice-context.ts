import { useQuery } from '@tanstack/react-query';
import {
  getSubscriptionInvoiceContext,
  type SubscriptionInvoiceContextResponse,
} from '@tuturuuu/internal-api/finance';
import { useWorkspaceActor } from '../../../../../hooks/use-workspace-visibility';

// The weak key follows the verified provider lifetime, including actor ABA.
const lifetimes = new WeakMap<object, number>();
let nextLifetime = 0;
function lifetimeKey(lifetime: object) {
  let key = lifetimes.get(lifetime);
  if (key === undefined) {
    key = ++nextLifetime;
    lifetimes.set(lifetime, key);
  }
  return key;
}

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
      actor ? lifetimeKey(actor.lifetime) : null,
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
