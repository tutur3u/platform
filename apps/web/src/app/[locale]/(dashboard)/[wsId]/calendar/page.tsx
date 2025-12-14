import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { TaskDialogWrapper } from '@tuturuuu/ui/tu-do/shared/task-dialog-wrapper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import CalendarClientPage from './client';
import TasksSidebar from './components/tasks-sidebar';

export const metadata: Metadata = {
  title: 'Calendar',
  description: 'Manage Calendar in your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
    locale: string;
  }>;
}

export default async function CalendarPage({ params }: PageProps) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId, locale }) => {
        const { withoutPermission } = await getPermissions({ wsId });

        const supabase = await createClient();

        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // Fetch Google auth token, calendar connections, and user email in parallel for better performance
        const [{ data: googleToken }, { data: calendarConnections }] = user?.id
          ? await Promise.all([
              supabase
                .from('calendar_auth_tokens')
                .select('*')
                .eq('ws_id', wsId)
                .maybeSingle(),
              supabase
                .from('calendar_connections')
                .select('*')
                .eq('ws_id', wsId)
                .order('created_at', { ascending: true }),
            ])
          : [
              {
                data: null,
              },
              {
                data: null,
              },
              [],
            ];

        if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);

        const enableSmartScheduling = true;
        const isPersonalWorkspace = workspace.id === user?.id;

        return (
          <TaskDialogWrapper
            isPersonalWorkspace={isPersonalWorkspace}
            wsId={workspace.id}
          >
            <CalendarSyncProvider
              wsId={workspace.id}
              experimentalGoogleToken={googleToken}
              initialCalendarConnections={calendarConnections || []}
            >
              {/* {DEV_MODE && <CalendarActiveSyncDebugger />} */}
              <div className="flex h-[calc(100vh-2rem)]">
                <CalendarClientPage
                  experimentalGoogleToken={googleToken}
                  calendarConnections={calendarConnections || []}
                  workspace={workspace}
                  enableSmartScheduling={enableSmartScheduling}
                />
                {enableSmartScheduling && (
                  <TasksSidebar wsId={wsId} locale={locale} />
                )}
              </div>
            </CalendarSyncProvider>
          </TaskDialogWrapper>
        );
      }}
    </WorkspaceWrapper>
  );
}
