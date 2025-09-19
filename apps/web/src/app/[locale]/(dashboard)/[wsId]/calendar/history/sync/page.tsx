import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarSyncDashboard } from '@tuturuuu/ui/legacy/calendar/settings/calendar-sync-dashboard';
import type { Metadata } from 'next';
import type { SyncLog } from '../../../../../../../../../../packages/ui/src/components/ui/legacy/calendar/settings/types';

export const metadata: Metadata = {
  title: 'Sync',
  description: 'Manage Sync in the History area of your Tuturuuu workspace.',
};

export default async function CalendarSyncDashboardPage() {
  const syncLogs = await getSyncLogs();
  return <CalendarSyncDashboard syncLogs={syncLogs} />;
}

async function getSyncLogs(): Promise<SyncLog[]> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return [];
    }

    console.log('User authenticated:', user.id);

    // First, let's check if the user has access to any workspaces
    const { data: workspaceMemberships, error: membershipError } =
      await supabase
        .from('workspace_members')
        .select('ws_id')
        .eq('user_id', user.id);

    if (membershipError) {
      console.error('Error checking workspace memberships:', membershipError);
      return [];
    }

    if (!workspaceMemberships || workspaceMemberships.length === 0) {
      console.log('User has no workspace memberships');
      return [];
    }

    const workspaceIds = workspaceMemberships.map((w) => w.ws_id);
    console.log('User has access to workspaces:', workspaceIds);

    // Try with regular client first - fetch sync logs with proper joins
    const { data: syncLogs, error } = await supabase
      .from('calendar_sync_dashboard')
      .select(
        `
        id, 
        updated_at, 
        start_time, 
        type, 
        ws_id, 
        triggered_by, 
        status, 
        end_time, 
        inserted_events, 
        updated_events, 
        deleted_events,
        workspaces!inner(id, name),
        users!inner(id, display_name, avatar_url)
      `
      )
      .in('ws_id', workspaceIds)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return [];
    }

    if (!syncLogs) {
      console.log('No sync logs found');
      return [];
    }

    console.log('Found sync logs:', syncLogs.length);

    const processedData = syncLogs.map((item) => {
      const workspace = {
        id: item.workspaces.id,
        name: item.workspaces.name || 'Unknown Workspace',
        color: 'bg-blue-500', // Add default color since workspaces table doesn't have a color field
      };

      const user = item.users || null;

      // Calculate duration
      const duration =
        item.end_time && item.start_time
          ? new Date(item.end_time).getTime() -
            new Date(item.start_time).getTime()
          : 0;

      return {
        id: item.id,
        timestamp: item.start_time || new Date().toISOString(),
        type: item.type as SyncLog['type'],
        workspace: workspace,
        triggeredBy: user
          ? {
              id: user.id,
              display_name: user.display_name || '',
              avatar: user.avatar_url,
            }
          : null,
        status: item.status as SyncLog['status'],
        duration: duration,
        events: {
          added: item.inserted_events || 0,
          updated: item.updated_events || 0,
          deleted: item.deleted_events || 0,
        },
        calendarSource: 'Google Calendar',
        error: null,
      };
    });

    return processedData satisfies SyncLog[];
  } catch (error) {
    console.error('Unexpected error in sync-logs API:', error);
    return [];
  }
}
