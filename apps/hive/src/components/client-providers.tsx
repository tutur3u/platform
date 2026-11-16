'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessagesCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { type ReactNode, useState } from 'react';

// The launcher mounts above this app's intl provider; its labels load from
// the same message bundle on first open.
const loadLauncherMessages = (locale: 'en' | 'vi') =>
  locale === 'vi'
    ? import('../../messages/vi.json')
    : import('../../messages/en.json');

export function ClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <MessagesCommandLauncher
        currentApp="hive"
        loadMessages={loadLauncherMessages}
      />
    </QueryClientProvider>
  );
}
