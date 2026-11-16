'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { AccountAssuranceRefresh } from '@tuturuuu/ui/custom/account-assurance-refresh';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import type { LaunchableAppSlug } from '@tuturuuu/utils/launchable-apps';
import { type ReactNode, Suspense, useState } from 'react';
import { AppSwitchTracker } from '../components/app-switch-tracker';
import { IntlGlobalCommandLauncher } from '../components/command-launcher';
import type { CommandLauncherHostApp } from '../components/command-launcher/command-launcher-utils';
import { SatelliteMobileDock } from '../components/satellite-mobile-dock';
import { createSatelliteQueryClient } from './query-client';

export function ClientProviders({
  children,
  commandHost,
  currentApp,
  actorId,
  accountSync = true,
}: {
  children: ReactNode;
  actorId?: string;
  /** Command center host when it differs from `currentApp`. */
  commandHost?: CommandLauncherHostApp;
  currentApp?: LaunchableAppSlug;
  /** False when the page knows nobody is signed in: skip account reads. */
  accountSync?: boolean;
}) {
  const [queryClient] = useState(createSatelliteQueryClient);
  const launcherHost = commandHost ?? currentApp;
  const content = (
    <>
      <AccountAssuranceRefresh />
      <ExperimentalUiSync account={accountSync} />
      <TooltipProvider>
        {children}
        {launcherHost && (
          <Suspense fallback={null}>
            <IntlGlobalCommandLauncher currentApp={launcherHost} />
          </Suspense>
        )}
        {currentApp && <AppSwitchTracker currentApp={currentApp} />}
        {currentApp && <SatelliteMobileDock currentApp={currentApp} />}
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
