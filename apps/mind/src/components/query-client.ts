import { QueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';

export function shouldRetryMindQuery(failureCount: number, error: unknown) {
  if (
    error instanceof InternalApiError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }

  return failureCount < 1;
}

export function createMindQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryMindQuery,
        staleTime: 20_000,
      },
    },
  });
}
