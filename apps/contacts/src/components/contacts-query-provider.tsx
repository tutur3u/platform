'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

export const CONTACTS_QUERY_STALE_TIME_MS = 5 * 60_000;
export const CONTACTS_QUERY_GC_TIME_MS = 30 * 60_000;

export function createContactsQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: CONTACTS_QUERY_GC_TIME_MS,
        refetchOnWindowFocus: false,
        staleTime: CONTACTS_QUERY_STALE_TIME_MS,
      },
    },
  });
}

export function ContactsQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createContactsQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
