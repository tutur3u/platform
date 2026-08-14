import {
  defaultShouldDehydrateQuery,
  type MutationCache,
  type QueryCache,
  QueryClient,
} from '@tanstack/react-query';
import { deserialize, serialize } from 'superjson';
import { HttpError, isRateLimitError } from '@/lib/api-fetch';

interface MakeQueryClientOptions {
  /** Custom QueryCache with error handlers (e.g. for toast notifications). */
  queryCache?: QueryCache;
  /** Custom MutationCache with error handlers (e.g. for toast notifications). */
  mutationCache?: MutationCache;
}

export function makeQueryClient(options?: MakeQueryClientOptions) {
  return new QueryClient({
    queryCache: options?.queryCache,
    mutationCache: options?.mutationCache,
    defaultOptions: {
      queries: {
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
        retry: (failureCount, error) => {
          // Retry rate-limited requests up to 3 times
          if (isRateLimitError(error)) return failureCount < 3;
          // Don't retry other errors by default
          return false;
        },
        retryDelay: (_attemptIndex, error) => {
          // Respect Retry-After header for rate limits
          if (error instanceof HttpError && error.retryAfter) {
            return error.retryAfter * 1000;
          }
          return 1000;
        },
      },
      mutations: {
        retry: (failureCount, error) => {
          // Retry rate-limited mutations up to 3 times
          if (isRateLimitError(error)) return failureCount < 3;
          return false;
        },
        retryDelay: (_attemptIndex, error) => {
          if (error instanceof HttpError && error.retryAfter) {
            return error.retryAfter * 1000;
          }
          return 1000;
        },
      },
      dehydrate: {
        serializeData: serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: deserialize,
      },
    },
  });
}
