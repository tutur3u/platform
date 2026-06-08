'use client';

import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import type { WorkspaceProductTier } from '@tuturuuu/types';
import { TaskDialogProvider } from '@tuturuuu/ui/tu-do/providers/task-dialog-provider';
import { WorkspacePresenceProvider } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import type { ComponentType, ReactNode } from 'react';
import { useLazyClientComponent } from '@/hooks/use-lazy-client-component';

type PersonalWorkspaceCollaborationBannerComponent = ComponentType<
  Record<string, never>
>;

type TaskDialogManagerComponent = ComponentType<{
  wsId: string;
}>;

interface DashboardWorkspaceProvidersProps {
  children: ReactNode;
  enablePresence: boolean;
  isPersonalWorkspace: boolean;
  showPersonalWorkspaceCollaborationBanner: boolean;
  tier: WorkspaceProductTier | null;
  wsId: string;
}

function loadPersonalWorkspaceCollaborationBanner(): Promise<PersonalWorkspaceCollaborationBannerComponent> {
  return import('./personal-workspace-collaboration-banner').then(
    (module) => module.PersonalWorkspaceCollaborationBanner
  );
}

function loadTaskDialogManager(): Promise<TaskDialogManagerComponent> {
  return import('@tuturuuu/ui/tu-do/shared/task-dialog-manager').then(
    (module) => module.TaskDialogManager
  );
}

export function DashboardWorkspaceProviders({
  children,
  enablePresence,
  isPersonalWorkspace,
  showPersonalWorkspaceCollaborationBanner,
  tier,
  wsId,
}: DashboardWorkspaceProvidersProps) {
  const PersonalWorkspaceCollaborationBanner = useLazyClientComponent(
    loadPersonalWorkspaceCollaborationBanner,
    showPersonalWorkspaceCollaborationBanner
  );
  const TaskDialogManager = useLazyClientComponent(loadTaskDialogManager);

  return (
    <RealtimeLogProvider wsId={wsId}>
      <WorkspacePresenceProvider
        wsId={wsId}
        tier={tier}
        enabled={enablePresence}
      >
        <TaskDialogProvider isPersonalWorkspace={isPersonalWorkspace}>
          {PersonalWorkspaceCollaborationBanner && (
            <PersonalWorkspaceCollaborationBanner />
          )}
          {children}
          {TaskDialogManager && <TaskDialogManager wsId={wsId} />}
        </TaskDialogProvider>
      </WorkspacePresenceProvider>
    </RealtimeLogProvider>
  );
}
