import { describe, expect, it } from 'vitest';
import { createSatelliteQueryClient } from './query-client';

describe('createSatelliteQueryClient', () => {
  it('deduplicates short-lived remounts and bounds failed-request retries', () => {
    const client = createSatelliteQueryClient();

    expect(client.getDefaultOptions().queries).toMatchObject({
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60_000,
    });
  });
});
