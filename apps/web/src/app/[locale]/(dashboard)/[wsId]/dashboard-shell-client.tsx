'use client';

import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ReactNode } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import { CalendarPreferencesProvider } from '@/lib/calendar-preferences-provider';
import { DashboardClientProviders } from './dashboard-client-providers';
import { DashboardSettingsDialogHost } from './dashboard-settings-dialog-host';
import type { DashboardNavigationLink } from './navigation-icon-descriptor';
import { Structure } from './structure';

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
  return (
    <CalendarPreferencesProvider wsId={wsId}>
      <SidebarProvider initialBehavior={sidebarBehavior}>
        {!isGuestWorkspace && (
          <DashboardSettingsDialogHost
            wsId={wsId}
            user={user}
            workspace={workspace}
          />
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
