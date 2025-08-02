import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
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

    // Try with regular client first - fetch sync logs with proper joins
    let { data: syncLogs, error } = await supabase
      .from('calendar_sync_dashboard')
      .select(
        `
        id, 
        created_at, 
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
      .order('created_at', { ascending: false });

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
          `
          id, 
          created_at, 
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
        .order('created_at', { ascending: false });

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

    const processedData = syncLogs.map((item) => {
      const workspace = item.workspaces;
      const user = item.users;

      // Calculate duration
      const duration =
        item.end_time && item.start_time
          ? new Date(item.end_time).getTime() -
            new Date(item.start_time).getTime()
          : 0;

      return {
        id: item.id,
        timestamp:
          item.created_at || item.start_time || new Date().toISOString(),
        type: item.type || 'background',
        workspace: workspace,
        triggeredBy: user || 'System',
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
