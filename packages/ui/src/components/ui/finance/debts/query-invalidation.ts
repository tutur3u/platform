import type { QueryClient, QueryKey } from '@tanstack/react-query';

const DEBT_LOAN_QUERY_ROOTS = new Set([
  'debt-loan',
  'debt-loan-summary',
  'debt-loans',
]);

function isDebtLoanMutationQueryKey(
  queryKey: QueryKey,
  wsId: string,
  debtLoanId?: string
) {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return false;
  }

  const [root, workspaceKey, entityId] = queryKey;

  if (
    typeof root !== 'string' ||
    workspaceKey !== wsId ||
    !DEBT_LOAN_QUERY_ROOTS.has(root)
  ) {
    return false;
  }

  if (root === 'debt-loan' && debtLoanId) {
    return entityId === debtLoanId;
  }

  return true;
}

export function invalidateDebtLoanMutationQueries(
  queryClient: QueryClient,
  wsId: string,
  debtLoanId?: string
) {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      isDebtLoanMutationQueryKey(query.queryKey, wsId, debtLoanId),
  });
}
