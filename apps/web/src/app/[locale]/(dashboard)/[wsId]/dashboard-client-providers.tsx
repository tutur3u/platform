'use client';

import type { WorkspaceProductTier } from '@tuturuuu/types';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const FadeSettingInitializer = dynamic(
  () =>
    import('@tuturuuu/ui/tu-do/shared/fade-setting-initializer').then(
      (module) => module.FadeSettingInitializer
    ),
  { ssr: false }
);
const DashboardWorkspaceProviders = dynamic(() =>
  import('./dashboard-workspace-providers').then(
    (module) => module.DashboardWorkspaceProviders
  )
);

interface DashboardClientProvidersProps {
  children: ReactNode;
  enablePresence: boolean;
  isPersonalWorkspace: boolean;
  showPersonalWorkspaceCollaborationBanner: boolean;
  tier: WorkspaceProductTier | null;
  wsId: string;
}

export function DashboardClientProviders({
  children,
  enablePresence,
  isPersonalWorkspace,
  showPersonalWorkspaceCollaborationBanner,
  tier,
  wsId,
}: DashboardClientProvidersProps) {
  return (
    <>
      <FadeSettingInitializer />
      <DashboardWorkspaceProviders
        wsId={wsId}
        tier={tier}
        enablePresence={enablePresence}
        isPersonalWorkspace={isPersonalWorkspace}
        showPersonalWorkspaceCollaborationBanner={
          showPersonalWorkspaceCollaborationBanner
        }
      >
        {children}
      </DashboardWorkspaceProviders>
    </>
  );
}
