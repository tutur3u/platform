import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
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
      return NextResponse.json(
        { message: 'Error checking workspace access' },
        { status: 500 }
      );
    }

    if (!workspaceMemberships || workspaceMemberships.length === 0) {
      console.log('User has no workspace memberships');
      return NextResponse.json([]);
    }

    const workspaceIds = workspaceMemberships.map((w) => w.ws_id);
    console.log('User has access to workspaces:', workspaceIds);

    // Try with regular client first - fetch basic sync logs without joins
    let { data: syncLogs, error } = await supabase
      .from('calendar_sync_dashboard')
      .select(
        'id, time, start_time, type, ws_id, triggered_by, status, end_time, inserted_events, updated_events, deleted_events'
      )
      .in('ws_id', workspaceIds)
      .order('time', { ascending: false });

    // If regular client fails, try with admin client as fallback
    if (error) {
      console.warn(
        'Regular client failed, trying admin client:',
        error.message
      );
      const sbAdmin = await createAdminClient();

      const adminResult = await sbAdmin
        .from('calendar_sync_dashboard')
        .select(
          'id, time, start_time, type, ws_id, triggered_by, status, end_time, inserted_events, updated_events, deleted_events'
        )
        .in('ws_id', workspaceIds)
        .order('time', { ascending: false });

      syncLogs = adminResult.data;
      error = adminResult.error;
    }

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { message: 'Error fetching sync logs', details: error.message },
        { status: 500 }
      );
    }

    if (!syncLogs) {
      console.log('No sync logs found');
      return NextResponse.json([]);
    }

    console.log('Found sync logs:', syncLogs.length);

    // Fetch workspace data separately
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id, name')
      .in('id', workspaceIds);

    const workspaceMap = new Map(workspaces?.map((w) => [w.id, w]) || []);

    // Fetch user data separately for non-null triggered_by values
    const userIds = syncLogs
      .map((log) => log.triggered_by)
      .filter((id) => id !== null) as string[];

    const { data: users } = await supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    const userMap = new Map(users?.map((u) => [u.id, u]) || []);

    const processedData = syncLogs.map((item) => {
      const workspace = workspaceMap.get(item.ws_id) || {
        id: item.ws_id,
        name: `Workspace ${item.ws_id}`,
        color: 'bg-blue-500',
      };

      const userData = item.triggered_by
        ? userMap.get(item.triggered_by)
        : null;
      const triggeredBy = userData
        ? {
            id: userData.id,
            name: userData.display_name || 'System',
            avatar:
              userData.avatar_url || '/placeholder.svg?height=32&width=32',
          }
        : null;

      // Calculate duration
      const duration =
        item.end_time && item.start_time
          ? new Date(item.end_time).getTime() -
            new Date(item.start_time).getTime()
          : 0;

      return {
        id: item.id,
        timestamp: item.time || item.start_time || new Date().toISOString(),
        type: item.type || 'background',
        workspace: workspace,
        triggeredBy: triggeredBy,
        status: item.status || 'completed',
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

    return NextResponse.json(processedData);
  } catch (error) {
    console.error('Unexpected error in sync-logs API:', error);
    return NextResponse.json(
      {
        message: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
