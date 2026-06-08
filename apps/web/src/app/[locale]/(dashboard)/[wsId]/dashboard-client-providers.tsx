'use client';

import type { WorkspaceProductTier } from '@tuturuuu/types';
import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';
import { useEffect, useState } from 'react';

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

type FadeSettingInitializerComponent = ComponentType<Record<string, never>>;

function useFadeSettingInitializerComponent() {
  const [FadeSettingInitializer, setFadeSettingInitializer] =
    useState<FadeSettingInitializerComponent | null>(null);

  useEffect(() => {
    let active = true;

    void import('@tuturuuu/ui/tu-do/shared/fade-setting-initializer').then(
      (module) => {
        if (active) {
          setFadeSettingInitializer(() => module.FadeSettingInitializer);
        }
      }
    );

    return () => {
      active = false;
    };
  }, []);

  return FadeSettingInitializer;
}

export function DashboardClientProviders({
  children,
  enablePresence,
  isPersonalWorkspace,
  showPersonalWorkspaceCollaborationBanner,
  tier,
  wsId,
}: DashboardClientProvidersProps) {
  const FadeSettingInitializer = useFadeSettingInitializerComponent();

  return (
    <>
      {FadeSettingInitializer && <FadeSettingInitializer />}
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
