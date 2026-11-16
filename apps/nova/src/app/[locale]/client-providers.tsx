'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessagesCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { ReactNode } from 'react';

// The launcher mounts above this app's intl provider; its labels load from
// the same message bundle on first open.
const loadLauncherMessages = (locale: 'en' | 'vi') =>
  locale === 'vi'
    ? import('../../../messages/vi.json')
    : import('../../../messages/en.json');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ExperimentalUiSync />
      <TooltipProvider>
        {children}
        <MessagesCommandLauncher
          currentApp="nova"
          loadMessages={loadLauncherMessages}
        />
      </TooltipProvider>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
}
