import type { QueryClient, QueryKey } from '@tanstack/react-query';

const TRANSACTION_MUTATION_QUERY_ROOTS = new Set([
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
  'spending_trends',
  'wallets',
  'workspace-invoices',
  'workspace-wallets',
]);

const TRANSACTION_ATTACHMENT_QUERY_ROOTS = new Set([
  'finance-transaction-attachment-url',
  'finance-transaction-attachments',
  'finance-transaction-bill-attachments',
]);

function queryKeyContainsTransaction(
  queryKey: QueryKey,
  transactionId: string
) {
  return queryKey.some((part) => {
    if (part === transactionId) {
      return true;
    }

    return (
      typeof part === 'string' &&
      part.includes(`finance/transactions/${transactionId}`)
    );
  });
}

function isTransactionMutationQueryKey(queryKey: QueryKey, wsId: string) {
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
    TRANSACTION_MUTATION_QUERY_ROOTS.has(root)
  );
}

function isTransactionAttachmentQueryKey(
  queryKey: QueryKey,
  wsId: string,
  transactionId: string
) {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return false;
  }

  const [root, workspaceKey] = queryKey;

  if (root === 'finance-transaction-attachment-text') {
    if (workspaceKey === wsId) {
      return queryKeyContainsTransaction(queryKey, transactionId);
    }

    return queryKey.length < 4;
  }

  return (
    typeof root === 'string' &&
    workspaceKey === wsId &&
    TRANSACTION_ATTACHMENT_QUERY_ROOTS.has(root) &&
    queryKeyContainsTransaction(queryKey, transactionId)
  );
}

export function invalidateTransactionMutationQueries(
  queryClient: QueryClient,
  wsId: string
) {
  return queryClient.invalidateQueries({
    predicate: (query) => isTransactionMutationQueryKey(query.queryKey, wsId),
  });
}

export function invalidateTransactionAttachmentQueries(
  queryClient: QueryClient,
  wsId: string,
  transactionId: string
) {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      isTransactionAttachmentQueryKey(query.queryKey, wsId, transactionId),
  });
}
