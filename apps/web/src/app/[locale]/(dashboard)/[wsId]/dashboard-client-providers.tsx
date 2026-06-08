'use client';

import type { WorkspaceProductTier } from '@tuturuuu/types';
import type { ComponentType, ReactNode } from 'react';
import { useLazyClientComponent } from '@/hooks/use-lazy-client-component';

interface DashboardClientProvidersProps {
  children: ReactNode;
  enablePresence: boolean;
  isPersonalWorkspace: boolean;
  showPersonalWorkspaceCollaborationBanner: boolean;
  tier: WorkspaceProductTier | null;
  wsId: string;
}

type FadeSettingInitializerComponent = ComponentType<Record<string, never>>;

type DashboardWorkspaceProvidersComponent =
  ComponentType<DashboardClientProvidersProps>;

function loadDashboardWorkspaceProviders(): Promise<DashboardWorkspaceProvidersComponent> {
  return import('./dashboard-workspace-providers').then(
    (module) => module.DashboardWorkspaceProviders
  );
}

function loadFadeSettingInitializer(): Promise<FadeSettingInitializerComponent> {
  return import('@tuturuuu/ui/tu-do/shared/fade-setting-initializer').then(
    (module) => module.FadeSettingInitializer
  );
}

function useFadeSettingInitializerComponent() {
  return useLazyClientComponent(loadFadeSettingInitializer);
}

export function DashboardClientProviders({
  children,
  enablePresence,
  isPersonalWorkspace,
  showPersonalWorkspaceCollaborationBanner,
  tier,
  wsId,
}: DashboardClientProvidersProps) {
  const DashboardWorkspaceProviders = useLazyClientComponent(
    loadDashboardWorkspaceProviders
  );
  const FadeSettingInitializer = useFadeSettingInitializerComponent();

  const content = DashboardWorkspaceProviders ? (
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
  ) : (
    children
  );

  return (
    <>
      {FadeSettingInitializer && <FadeSettingInitializer />}
      {content}
    </>
  );
}
