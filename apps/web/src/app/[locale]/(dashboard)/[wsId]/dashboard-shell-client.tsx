'use client';

import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Dialog } from '@tuturuuu/ui/dialog';
import { useSearchParams } from 'next/navigation';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { SettingsDialogFullscreenSkeleton } from '@/components/settings/settings-dialog-skeleton';
import { SidebarProvider } from '@/context/sidebar-context';
import { useLazyClientComponent } from '@/hooks/use-lazy-client-component';
import type { DashboardNavigationLink } from './navigation-icon-descriptor';
import type { StructureProps } from './structure-types';

type DashboardSettingsDialogHostComponent = ComponentType<{
  user: WorkspaceUser | null;
  workspace?: Workspace | null;
  wsId?: string;
}>;

type DashboardSettingsDialogHostModule = {
  DashboardSettingsDialogHost: DashboardSettingsDialogHostComponent;
  preloadDashboardSettingsDialogHostContent?: () => void;
};

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
  sidebarBehaviorUpdatedAt: number | null;
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

let dashboardSettingsDialogHostPromise: Promise<DashboardSettingsDialogHostComponent> | null =
  null;
const BOARD_SETTINGS_PRELOAD_EVENT = 'tuturuuu:board-settings-intent';
const SETTINGS_DIALOG_OPEN_INTENT_EVENT =
  'tuturuuu:settings-dialog-open-intent';

function loadDashboardSettingsDialogHost(): Promise<DashboardSettingsDialogHostComponent> {
  const importDashboardSettingsDialogHost = () =>
    import('./dashboard-settings-dialog-host');

  dashboardSettingsDialogHostPromise ??=
    importDashboardSettingsDialogHost().then(
      (module: DashboardSettingsDialogHostModule) => {
        module.preloadDashboardSettingsDialogHostContent?.();
        return module.DashboardSettingsDialogHost;
      }
    );

  return dashboardSettingsDialogHostPromise;
}

function preloadDashboardSettingsDialogHost() {
  void loadDashboardSettingsDialogHost();
}

function useDashboardSettingsDialogHost(enabled: boolean) {
  return useLazyClientComponent(loadDashboardSettingsDialogHost, enabled);
}

function DashboardShellFallback({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}

function DashboardSettingsDialogSkeletonGate({
  enabled,
  hostReady,
}: {
  enabled: boolean;
  hostReady: boolean;
}) {
  const searchParams = useSearchParams();
  const [intentOpen, setIntentOpen] = useState(false);
  const settingsRequested = searchParams.get('settingsDialog') === 'open';

  useEffect(() => {
    if (!enabled) return;

    const handlePreload = () => {
      preloadDashboardSettingsDialogHost();
    };
    const handleOpenIntent = () => {
      setIntentOpen(true);
      preloadDashboardSettingsDialogHost();
    };

    window.addEventListener(BOARD_SETTINGS_PRELOAD_EVENT, handlePreload);
    window.addEventListener(
      SETTINGS_DIALOG_OPEN_INTENT_EVENT,
      handleOpenIntent
    );

    return () => {
      window.removeEventListener(BOARD_SETTINGS_PRELOAD_EVENT, handlePreload);
      window.removeEventListener(
        SETTINGS_DIALOG_OPEN_INTENT_EVENT,
        handleOpenIntent
      );
    };
  }, [enabled]);

  useEffect(() => {
    if (hostReady || settingsRequested) {
      setIntentOpen(false);
    }
  }, [hostReady, settingsRequested]);

  if (!enabled || hostReady || (!settingsRequested && !intentOpen)) {
    return null;
  }

  return (
    <Dialog open>
      <SettingsDialogFullscreenSkeleton />
    </Dialog>
  );
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
  sidebarBehaviorUpdatedAt,
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
  ) : null;

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
    <SidebarProvider
      initialBehavior={sidebarBehavior}
      initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
    >
      <DashboardSettingsDialogSkeletonGate
        enabled={!isGuestWorkspace}
        hostReady={Boolean(SettingsDialogHost)}
      />
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
