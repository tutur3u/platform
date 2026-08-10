'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { LaunchableAppSlug } from '@tuturuuu/utils/launchable-apps';
import { type ReactNode, Suspense } from 'react';
import { GlobalCommandLauncher } from '../components/command-launcher';
import { createSatelliteQueryClient } from './query-client';

const queryClient = createSatelliteQueryClient();

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
    </QueryClientProvider>
  );
}
