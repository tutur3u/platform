'use client';

import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import type { WorkspaceProductTier } from '@tuturuuu/types';
import { TaskDialogProvider } from '@tuturuuu/ui/tu-do/providers/task-dialog-provider';
import { WorkspacePresenceProvider } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

const FadeSettingInitializer = dynamic(
  () =>
    import('@tuturuuu/ui/tu-do/shared/fade-setting-initializer').then(
      (module) => module.FadeSettingInitializer
    ),
  { ssr: false }
);
const PersonalWorkspaceCollaborationBanner = dynamic(
  () =>
    import('./personal-workspace-collaboration-banner').then(
      (module) => module.PersonalWorkspaceCollaborationBanner
    ),
  { ssr: false }
);
const TaskDialogManager = dynamic(
  () =>
    import('@tuturuuu/ui/tu-do/shared/task-dialog-manager').then(
      (module) => module.TaskDialogManager
    ),
  { ssr: false }
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
      <RealtimeLogProvider wsId={wsId}>
        <WorkspacePresenceProvider
          wsId={wsId}
          tier={tier}
          enabled={enablePresence}
        >
          <TaskDialogProvider isPersonalWorkspace={isPersonalWorkspace}>
            {showPersonalWorkspaceCollaborationBanner && (
              <PersonalWorkspaceCollaborationBanner />
            )}
            {children}
            <TaskDialogManager wsId={wsId} />
          </TaskDialogProvider>
        </WorkspacePresenceProvider>
      </RealtimeLogProvider>
    </>
  );
}
