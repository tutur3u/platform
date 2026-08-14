import { describe, expect, it } from 'vitest';
import {
  createSatelliteQueryClient,
  SATELLITE_QUERY_GC_TIME_MS,
  SATELLITE_QUERY_STALE_TIME_MS,
} from './query-client';

describe('createSatelliteQueryClient', () => {
  it('deduplicates short-lived remounts and bounds failed-request retries', () => {
    const client = createSatelliteQueryClient();

    expect(client.getDefaultOptions().queries).toMatchObject({
      gcTime: SATELLITE_QUERY_GC_TIME_MS,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: SATELLITE_QUERY_STALE_TIME_MS,
    });
  });
});
