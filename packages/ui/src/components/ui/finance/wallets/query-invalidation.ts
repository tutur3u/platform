import type { QueryClient, QueryKey } from '@tanstack/react-query';

const WALLET_MUTATION_QUERY_ROOTS = new Set([
  'balance-trend',
  'budget_status',
  'budgets',
  'category-breakdown',
  'category_spending',
  'closing-balance',
  'daily-chart',
  'monthly-chart',
  'monthly-closing-balance',
  'monthly-opening-balance',
  'opening-balance',
  'recurring_transactions',
  'spending_trends',
  'wallet-checkpoint-summary',
  'wallet-checkpoints',
  'upcoming_recurring_transactions',
  'wallets',
  'workspace-invoices',
  'workspace-wallets',
]);

function isWalletMutationQueryKey(queryKey: QueryKey, wsId: string) {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return false;
  }

  const [root, workspaceKey] = queryKey;

  if (
    typeof root === 'string' &&
    root.includes(`/api/workspaces/${wsId}/wallets`)
  ) {
    return true;
  }

  if (
    typeof root === 'string' &&
    root.includes(`/api/workspaces/${wsId}/transactions`)
  ) {
    return true;
  }

  return (
    typeof root === 'string' &&
    workspaceKey === wsId &&
    WALLET_MUTATION_QUERY_ROOTS.has(root)
  );
}

export function invalidateWalletMutationQueries(
  queryClient: QueryClient,
  wsId: string
) {
  return queryClient.invalidateQueries({
    predicate: (query) => isWalletMutationQueryKey(query.queryKey, wsId),
  });
}
