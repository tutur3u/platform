import { QueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';

export function shouldRetryChatQuery(failureCount: number, error: unknown) {
  if (
    error instanceof InternalApiError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }

  return failureCount < 1;
}

export function createChatQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryChatQuery,
        staleTime: 20_000,
      },
    },
  });
}
