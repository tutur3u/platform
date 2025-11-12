import WorkspaceWrapper from '@/components/workspace-wrapper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import CalendarClientPage from './client';

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
      {async ({ workspace, wsId }) => {
        const { withoutPermission } = await getPermissions({ wsId });

        const supabase = await createClient();

        // Fetch Google auth token and calendar connections in parallel for better performance
        const [{ data: googleToken }, { data: calendarConnections }] =
          await Promise.all([
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
          ]);

        if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);

        return (
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
              />
            </div>
          </CalendarSyncProvider>
        );
      }}
    </WorkspaceWrapper>
  );
}
