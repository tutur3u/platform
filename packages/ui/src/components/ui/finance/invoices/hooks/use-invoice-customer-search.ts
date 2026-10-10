import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { useWorkspaceActor } from '../../../../../hooks/use-workspace-visibility';
import {
  getWorkspaceUserWithInternalApi,
  listWorkspaceUsersWithInternalApi,
} from '../internal-api';
import { invoiceActorLifetimeKey } from './invoice-actor-lifetime-key';

const INVOICE_CUSTOMER_PAGE_SIZE = 25;

type WorkspaceUsersPage = {
  data: WorkspaceUser[];
  count: number;
  offset: number;
};

async function fetchInvoiceCustomerPage(
  wsId: string,
  searchQuery: string,
  offset: number
): Promise<WorkspaceUsersPage> {
  const payload = await listWorkspaceUsersWithInternalApi(wsId, {
    from: offset,
    limit: INVOICE_CUSTOMER_PAGE_SIZE,
    q: searchQuery.trim() || undefined,
    to: offset + INVOICE_CUSTOMER_PAGE_SIZE - 1,
  });

  return {
    data: payload.data,
    count: payload.count,
    offset,
  };
}

async function fetchWorkspaceUserById(
  wsId: string,
  userId: string
): Promise<WorkspaceUser | null> {
  return getWorkspaceUserWithInternalApi(wsId, userId);
}

async function readInActorScope<T>(
  actor: ReturnType<typeof useWorkspaceActor>,
  read: () => Promise<T>
): Promise<T> {
  if (!actor) throw new Error('Workspace account unavailable');
  actor.assertActive();
  try {
    const result = await read();
    actor.assertActive();
    return result;
  } catch (error) {
    actor.assertActive();
    throw error;
  }
}

export function useInvoiceCustomerSearch(
  wsId: string,
  searchQuery: string,
  selectedUserId: string
) {
  const actor = useWorkspaceActor();
  const lifetime = actor ? invoiceActorLifetimeKey(actor.lifetime) : null;
  const normalizedSearchQuery = searchQuery.trim();

  const usersQuery = useInfiniteQuery({
    queryKey: [
      'invoice-customer-search',
      wsId,
      normalizedSearchQuery,
      actor?.actorId ?? null,
      lifetime,
    ],
    queryFn: async ({ pageParam = 0 }) =>
      readInActorScope(actor, () =>
        fetchInvoiceCustomerPage(wsId, normalizedSearchQuery, pageParam)
      ),
    initialPageParam: 0,
    placeholderData: (previousData, previousQuery) => {
      if (
        !actor ||
        previousQuery?.queryKey[1] !== wsId ||
        previousQuery.queryKey[3] !== actor.actorId ||
        previousQuery.queryKey[4] !== lifetime
      )
        return undefined;
      try {
        actor.assertActive();
        return previousData;
      } catch {
        return undefined;
      }
    },
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );
      return lastPage.data.length > 0 && loadedCount < lastPage.count
        ? loadedCount
        : undefined;
    },
    enabled: !!actor && !!wsId,
    retry: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const loadedCustomers =
    usersQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const needsSelectedUser =
    !!actor &&
    !!wsId &&
    !!selectedUserId &&
    !loadedCustomers.some((user) => user.id === selectedUserId);
  const selectedUserQuery = useQuery({
    queryKey: [
      'invoice-customer',
      wsId,
      selectedUserId,
      actor?.actorId ?? null,
      lifetime,
    ],
    queryFn: async () =>
      readInActorScope(actor, () =>
        fetchWorkspaceUserById(wsId, selectedUserId)
      ),
    enabled: needsSelectedUser,
    retry: false,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const customersById = new Map<string, WorkspaceUser>();

  if (selectedUserQuery.data) {
    customersById.set(selectedUserQuery.data.id, selectedUserQuery.data);
  }

  for (const customer of loadedCustomers) {
    customersById.set(customer.id, customer);
  }

  const customers = Array.from(customersById.values());
  const selectedUser =
    (selectedUserId
      ? customers.find((user) => user.id === selectedUserId)
      : undefined) ?? undefined;

  return {
    ...usersQuery,
    customers,
    selectedUser,
    error:
      usersQuery.error ?? (needsSelectedUser ? selectedUserQuery.error : null),
    isLoading: usersQuery.isLoading || selectedUserQuery.isLoading,
    isFetchingSelectedUser: selectedUserQuery.isFetching,
    refetch: () =>
      Promise.all([
        usersQuery.refetch(),
        ...(needsSelectedUser ? [selectedUserQuery.refetch()] : []),
      ]),
  };
}
