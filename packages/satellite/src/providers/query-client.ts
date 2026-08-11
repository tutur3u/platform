import { QueryClient } from '@tanstack/react-query';

export const SATELLITE_QUERY_STALE_TIME_MS = 30_000;

export function createSatelliteQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: SATELLITE_QUERY_STALE_TIME_MS,
      },
    },
  });
}
