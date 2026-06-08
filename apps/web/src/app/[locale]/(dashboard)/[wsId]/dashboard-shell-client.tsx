'use client';

import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ComponentType, ReactNode } from 'react';
import { SidebarProvider } from '@/context/sidebar-context';
import { useLazyClientComponent } from '@/hooks/use-lazy-client-component';
import type { DashboardNavigationLink } from './navigation-icon-descriptor';
import type { StructureProps } from './structure-types';

type DashboardSettingsDialogHostComponent = ComponentType<{
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
  wsId?: string;
}>;

type CalendarPreferencesProviderComponent = ComponentType<{
  children: ReactNode;
  wsId?: string;
}>;

type DashboardClientProvidersComponent = ComponentType<{
  children: ReactNode;
  enablePresence: boolean;
  isPersonalWorkspace: boolean;
  showPersonalWorkspaceCollaborationBanner: boolean;
  tier: WorkspaceProductTier | null;
  wsId: string;
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

function loadCalendarPreferencesProvider(): Promise<CalendarPreferencesProviderComponent> {
  return import('@/lib/calendar-preferences-provider').then(
    (module) => module.CalendarPreferencesProvider
  );
}

function loadDashboardClientProviders(): Promise<DashboardClientProvidersComponent> {
  return import('./dashboard-client-providers').then(
    (module) => module.DashboardClientProviders
  );
}

function loadStructure(): Promise<ComponentType<StructureProps>> {
  return import('./structure').then((module) => module.Structure);
}

function loadDashboardSettingsDialogHost(): Promise<DashboardSettingsDialogHostComponent> {
  return import('./dashboard-settings-dialog-host').then(
    (module) => module.DashboardSettingsDialogHost
  );
}

function useDashboardSettingsDialogHost(enabled: boolean) {
  return useLazyClientComponent(loadDashboardSettingsDialogHost, enabled);
}

function DashboardShellFallback({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
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
  const CalendarPreferencesProvider = useLazyClientComponent(
    loadCalendarPreferencesProvider
  );
  const DashboardClientProviders = useLazyClientComponent(
    loadDashboardClientProviders
  );
  const Structure = useLazyClientComponent(loadStructure);
  const SettingsDialogHost = useDashboardSettingsDialogHost(!isGuestWorkspace);

  const dashboardContent = DashboardClientProviders ? (
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
  ) : (
    children
  );

  const structuredContent = Structure ? (
    <Structure
      wsId={wsId}
      user={user}
      workspace={workspace}
      defaultCollapsed={defaultCollapsed}
      links={links}
      actions={actions}
      userPopover={userPopover}
    >
      {dashboardContent}
    </Structure>
  ) : (
    <DashboardShellFallback>{dashboardContent}</DashboardShellFallback>
  );

  const shellContent = (
    <SidebarProvider initialBehavior={sidebarBehavior}>
      {SettingsDialogHost && (
        <SettingsDialogHost wsId={wsId} user={user} workspace={workspace} />
      )}
      {personalWorkspacePrompt && (
        <div className="px-2 pt-2 md:px-4 md:pt-3">
          {personalWorkspacePrompt}
        </div>
      )}
      {structuredContent}
    </SidebarProvider>
  );

  if (!CalendarPreferencesProvider) return shellContent;

  return (
    <CalendarPreferencesProvider wsId={wsId}>
      {shellContent}
    </CalendarPreferencesProvider>
  );
}
