import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { invalidateInvoiceMutationQueries } from './query-invalidation';

it('refreshes coverage and analytics after invoice changes without invalidating other workspaces', async () => {
  const client = new QueryClient();
  const roots = [
    'invoice-subscription-analytics',
    'subscription-invoice-context',
    'invoice-analytics',
    'pending-invoices',
  ];
  for (const root of roots)
    for (const ws of ['ws1', 'ws2'])
      client.setQueryData([root, ws, 'filters'], { value: 1 });
  client.setQueryData(['unrelated', 'ws1'], { value: 1 });
  await invalidateInvoiceMutationQueries(client, 'ws1');
  for (const root of roots) {
    expect(client.getQueryState([root, 'ws1', 'filters'])?.isInvalidated).toBe(
      true
    );
    expect(client.getQueryState([root, 'ws2', 'filters'])?.isInvalidated).toBe(
      false
    );
  }
  expect(client.getQueryState(['unrelated', 'ws1'])?.isInvalidated).toBe(false);
  client.clear();
});
