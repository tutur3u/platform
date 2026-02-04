import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query client configuration for React Native
 *
 * Optimized settings for mobile:
 * - Longer staleTime (5 min) to reduce unnecessary refetches on cellular
 * - Retry with exponential backoff for flaky connections
 * - Garbage collection at 30 min to manage memory
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is fresh for 5 minutes - reduces refetches on mobile
        staleTime: 5 * 60 * 1000,
        // Keep unused data for 30 minutes before garbage collection
        gcTime: 30 * 60 * 1000,
        // Retry failed requests 3 times with exponential backoff
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Don't refetch when window regains focus (mobile behavior differs)
        refetchOnWindowFocus: false,
        // Refetch when reconnecting to network
        refetchOnReconnect: true,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
      },
    },
  });
}

/**
 * Singleton query client instance
 * Use this directly or through the QueryProvider
 */
export const queryClient = createQueryClient();
