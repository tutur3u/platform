import { useInfiniteQuery } from '@tanstack/react-query';
import { listFinanceInvoices } from '@tuturuuu/internal-api/finance';
import { useWorkspaceActor } from '../../../../../hooks/use-workspace-visibility';
import { invoiceActorLifetimeKey } from './invoice-actor-lifetime-key';

export function useInfiniteUserInvoices(
  wsId: string,
  userId: string,
  pageSize = 10
) {
  const actor = useWorkspaceActor();
  return useInfiniteQuery({
    queryKey: [
      'infinite-user-invoices',
      wsId,
      userId,
      actor?.actorId ?? null,
      actor ? invoiceActorLifetimeKey(actor.lifetime) : null,
    ],
    queryFn: async ({ pageParam = 1 }: { pageParam: number }) => {
      if (!actor) throw new Error('Workspace account unavailable');
      actor.assertActive();
      try {
        const payload = await listFinanceInvoices(wsId, {
          customerIds: [userId],
          page: String(pageParam),
          pageSize: String(pageSize),
        });
        actor.assertActive();
        const data = payload.data || [];
        const count = payload.count ?? 0;
        const fetchedCount = pageParam * pageSize;
        return {
          data,
          count,
          nextPage: fetchedCount < count ? pageParam + 1 : null,
          hasMore: fetchedCount < count,
        };
      } catch (error) {
        actor.assertActive();
        throw error;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!actor && !!userId,
  });
}
