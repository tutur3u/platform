import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { WorkspacePresenceProvider } from '@tuturuuu/ui/tu-do/providers/workspace-presence-provider';
import { TaskDialogWrapper } from '@tuturuuu/ui/tu-do/shared/task-dialog-wrapper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;

  // Get current user for authentication
  const user = await getCurrentUser();
  if (!user?.id) redirect('/login');

  // Get workspace with proper resolution (handles "personal", "internal", etc.)
  const workspace = await getWorkspace(id, { useAdmin: true });
  const wsId = workspace.id;

  // Check if user has access to workspace
  if (!workspace) redirect('/onboarding');
  if (!workspace?.joined) {
    // User hasn't joined this workspace yet
    redirect('/');
  }

  return (
    <RealtimeLogProvider wsId={wsId}>
      <WorkspacePresenceProvider
        wsId={wsId}
        tier={workspace.tier ?? null}
        enabled={!workspace.personal}
      >
        <TaskDialogWrapper
          isPersonalWorkspace={!!workspace.personal}
          wsId={wsId}
        >
          {children}
        </TaskDialogWrapper>
      </WorkspacePresenceProvider>
    </RealtimeLogProvider>
  );
}
