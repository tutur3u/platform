import { describe, expect, it } from 'vitest';
import {
  createMigrationQueryClient,
  dehydrateMigrationQueryClient,
} from './query';

describe('query adapters', () => {
  it('centralizes migration query defaults', () => {
    const queryClient = createMigrationQueryClient();

    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    });
  });

  it('dehydrates prefetched route data', async () => {
    const queryClient = createMigrationQueryClient();
    await queryClient.prefetchQuery({
      queryFn: () => Promise.resolve({ ok: true }),
      queryKey: ['migration-status'],
    });

    const dehydrated = dehydrateMigrationQueryClient(queryClient);

    expect(dehydrated.queries).toHaveLength(1);
    expect(dehydrated.queries[0]?.queryKey).toEqual(['migration-status']);
  });
});
