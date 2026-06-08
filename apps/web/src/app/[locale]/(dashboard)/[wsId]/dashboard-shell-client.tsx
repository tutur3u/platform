'use client';

import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import type { DashboardNavigationLink } from './navigation-icon-descriptor';

const CalendarPreferencesProvider = dynamic(() =>
  import('@/lib/calendar-preferences-provider').then(
    (module) => module.CalendarPreferencesProvider
  )
);
const DashboardClientProviders = dynamic(() =>
  import('./dashboard-client-providers').then(
    (module) => module.DashboardClientProviders
  )
);
const Structure = dynamic(() =>
  import('./structure').then((module) => module.Structure)
);

type DashboardSettingsDialogHostComponent = ComponentType<{
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
  wsId?: string;
}>;

interface DashboardShellClientProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  enablePresence: boolean;
  isGuestWorkspace: boolean;
  isPersonalWorkspace: boolean;
  links: (DashboardNavigationLink | null)[];
  personalWorkspacePrompt?: ReactNode;
  showPersonalWorkspaceCollaborationBanner: boolean;
  sidebarBehavior: 'expanded' | 'collapsed' | 'hover';
  tier: WorkspaceProductTier | null;
  user: WorkspaceUser;
  userPopover: ReactNode;
  workspace: Workspace & { tier?: WorkspaceProductTier | null };
  wsId: string;
}

function useDashboardSettingsDialogHost(enabled: boolean) {
  const [SettingsDialogHost, setSettingsDialogHost] =
    useState<DashboardSettingsDialogHostComponent | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSettingsDialogHost(null);
      return;
    }

    let active = true;

    void import('./dashboard-settings-dialog-host').then((module) => {
      if (active) {
        setSettingsDialogHost(() => module.DashboardSettingsDialogHost);
      }
    });

    return () => {
      active = false;
    };
  }, [enabled]);

  return SettingsDialogHost;
}

export function DashboardShellClient({
  actions,
  children,
  defaultCollapsed,
  enablePresence,
  isGuestWorkspace,
  isPersonalWorkspace,
  links,
  personalWorkspacePrompt,
  showPersonalWorkspaceCollaborationBanner,
  sidebarBehavior,
  tier,
  user,
  userPopover,
  workspace,
  wsId,
}: DashboardShellClientProps) {
  const SettingsDialogHost = useDashboardSettingsDialogHost(!isGuestWorkspace);

  return (
    <CalendarPreferencesProvider wsId={wsId}>
      <SidebarProvider initialBehavior={sidebarBehavior}>
        {SettingsDialogHost && (
          <SettingsDialogHost wsId={wsId} user={user} workspace={workspace} />
        )}
        {personalWorkspacePrompt && (
          <div className="px-2 pt-2 md:px-4 md:pt-3">
            {personalWorkspacePrompt}
          </div>
        )}
        <Structure
          wsId={wsId}
          user={user}
          workspace={workspace}
          defaultCollapsed={defaultCollapsed}
          links={links}
          actions={actions}
          userPopover={userPopover}
        >
          <DashboardClientProviders
            wsId={wsId}
            tier={tier}
            enablePresence={enablePresence}
            isPersonalWorkspace={isPersonalWorkspace}
            showPersonalWorkspaceCollaborationBanner={
              showPersonalWorkspaceCollaborationBanner
            }
          >
            {children}
          </DashboardClientProviders>
        </Structure>
      </SidebarProvider>
    </CalendarPreferencesProvider>
  );
}
