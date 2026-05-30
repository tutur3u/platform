'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { LaunchableAppSlug } from '@tuturuuu/utils/launchable-apps';
import type { ReactNode } from 'react';
import { GlobalCommandLauncher } from '../components/command-launcher';

const queryClient = new QueryClient();

export function ClientProviders({
  children,
  currentApp,
}: {
  children: ReactNode;
  currentApp?: LaunchableAppSlug;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
        {currentApp && <GlobalCommandLauncher currentApp={currentApp} />}
      </TooltipProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
