'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { LaunchableAppSlug } from '@tuturuuu/utils/launchable-apps';
import { type ReactNode, Suspense } from 'react';
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
        {currentApp && (
          <Suspense fallback={null}>
            <GlobalCommandLauncher currentApp={currentApp} />
          </Suspense>
        )}
      </TooltipProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
