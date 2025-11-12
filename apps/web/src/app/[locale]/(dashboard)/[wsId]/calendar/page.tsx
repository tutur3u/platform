import WorkspaceWrapper from '@/components/workspace-wrapper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

        // Fetch Google auth token (for authentication check)
        const { data: googleToken } = await supabase
          .from('calendar_auth_tokens')
          .select('*')
          .eq('ws_id', wsId)
          .maybeSingle();

        // Fetch calendar connections (to determine which calendars to sync)
        const { data: calendarConnections } = await supabase
          .from('calendar_connections')
          .select('*')
          .eq('ws_id', wsId)
          .order('created_at', { ascending: true });

        if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);

        return (
          <CalendarSyncProvider
            wsId={workspace.id}
            experimentalGoogleToken={googleToken}
            calendarConnections={calendarConnections || []}
            useQuery={useQuery}
            useQueryClient={useQueryClient}
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
