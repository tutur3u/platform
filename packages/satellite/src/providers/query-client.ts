import { QueryClient } from '@tanstack/react-query';

export const SATELLITE_QUERY_STALE_TIME_MS = 5 * 60_000;
export const SATELLITE_QUERY_GC_TIME_MS = 30 * 60_000;

export function createSatelliteQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        gcTime: SATELLITE_QUERY_GC_TIME_MS,
        refetchOnWindowFocus: false,
        staleTime: SATELLITE_QUERY_STALE_TIME_MS,
      },
    },
  });
}
