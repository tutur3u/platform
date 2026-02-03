import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { queryClient } from '../query/client';

type QueryProviderProps = {
  children: ReactNode;
};

/**
 * TanStack Query provider wrapper
 *
 * Provides the QueryClient context to the entire app.
 * All data fetching hooks (useQuery, useMutation) require this provider.
 */
export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
