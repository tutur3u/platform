'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { AccountAssuranceRefresh } from '@tuturuuu/ui/custom/account-assurance-refresh';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { LaunchableAppSlug } from '@tuturuuu/utils/launchable-apps';
import { type ReactNode, Suspense, useState } from 'react';
import { GlobalCommandLauncher } from '../components/command-launcher';
import { createSatelliteQueryClient } from './query-client';

export function ClientProviders({
  children,
  currentApp,
  actorId,
}: {
  children: ReactNode;
  actorId?: string;
  currentApp?: LaunchableAppSlug;
}) {
  const [queryClient] = useState(createSatelliteQueryClient);
  const content = (
    <>
      <AccountAssuranceRefresh />
      <TooltipProvider>
        {children}
        {currentApp && (
          <Suspense fallback={null}>
            <GlobalCommandLauncher currentApp={currentApp} />
          </Suspense>
        )}
      </TooltipProvider>
    </>
  );
  return (
    <QueryClientProvider client={queryClient}>
      {actorId ? (
        <WorkspaceVisibilityProvider actorId={actorId}>
          {content}
        </WorkspaceVisibilityProvider>
      ) : (
        content
      )}
    </QueryClientProvider>
  );
}
