import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateDebtLoanMutationQueries } from './query-invalidation';

describe('debt loan query invalidation', () => {
  it('invalidates debt list and summary caches for the workspace', async () => {
    const queryClient = new QueryClient();
    const summaryKey = ['debt-loan-summary', 'ws-1'];
    const allListKey = ['debt-loans', 'ws-1', 'all'];
    const debtListKey = ['debt-loans', 'ws-1', 'debt'];
    const detailKey = ['debt-loan', 'ws-1', 'debt-1'];
    const otherWorkspaceKey = ['debt-loans', 'ws-2', 'all'];

    for (const key of [
      summaryKey,
      allListKey,
      debtListKey,
      detailKey,
      otherWorkspaceKey,
    ]) {
      queryClient.setQueryData(key, true);
    }

    await invalidateDebtLoanMutationQueries(queryClient, 'ws-1');

    expect(queryClient.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(allListKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(debtListKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherWorkspaceKey)?.isInvalidated).toBe(
      false
    );
  });

  it('keeps detail invalidation scoped when a debt loan id is provided', async () => {
    const queryClient = new QueryClient();
    const summaryKey = ['debt-loan-summary', 'ws-1'];
    const listKey = ['debt-loans', 'ws-1', 'all'];
    const selectedDetailKey = ['debt-loan', 'ws-1', 'debt-1'];
    const otherDetailKey = ['debt-loan', 'ws-1', 'debt-2'];

    for (const key of [
      summaryKey,
      listKey,
      selectedDetailKey,
      otherDetailKey,
    ]) {
      queryClient.setQueryData(key, true);
    }

    await invalidateDebtLoanMutationQueries(queryClient, 'ws-1', 'debt-1');

    expect(queryClient.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(selectedDetailKey)?.isInvalidated).toBe(
      true
    );
    expect(queryClient.getQueryState(otherDetailKey)?.isInvalidated).toBe(
      false
    );
  });
});
