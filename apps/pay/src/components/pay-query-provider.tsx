'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { type ReactNode, useState } from 'react';

export function PayQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ExperimentalUiSync />
      {children}
    </QueryClientProvider>
  );
}
