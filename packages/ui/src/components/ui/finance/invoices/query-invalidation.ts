import type { QueryClient, QueryKey } from '@tanstack/react-query';

const INVOICE_MUTATION_QUERY_ROOTS = new Set([
  'available-promotions',
  'balance-trend',
  'budget_status',
  'budgets',
  'category-breakdown',
  'category_spending',
  'closing-balance',
  'daily-chart',
  'infinite-user-invoices',
  'invoice-analytics',
  'monthly-chart',
  'monthly-closing-balance',
  'monthly-opening-balance',
  'opening-balance',
  'pending-invoices',
  'pending-invoices-current-month',
  'promotions',
  'spending_trends',
  'user-invoices',
  'user-linked-promotions',
  'user-referral-discounts',
  'wallets',
  'workspace-invoices',
  'workspace-wallets',
]);

function isInvoiceMutationQueryKey(queryKey: QueryKey, wsId: string) {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return false;
  }

  const [root, workspaceKey] = queryKey;

  if (
    typeof root === 'string' &&
    root.includes(`/api/workspaces/${wsId}/transactions`)
  ) {
    return true;
  }

  if (
    typeof root === 'string' &&
    root.includes(`/api/workspaces/${wsId}/wallets`)
  ) {
    return true;
  }

  return (
    typeof root === 'string' &&
    workspaceKey === wsId &&
    INVOICE_MUTATION_QUERY_ROOTS.has(root)
  );
}

export function invalidateInvoiceMutationQueries(
  queryClient: QueryClient,
  wsId: string
) {
  return queryClient.invalidateQueries({
    predicate: (query) => isInvoiceMutationQueryKey(query.queryKey, wsId),
  });
}
