import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * POST /api/v1/workspaces/[wsId]/calendars/reset
 * Reset all calendar data for a workspace:
 * 1. Delete all external calendar connections (Google, Microsoft)
 * 2. Delete all calendar events in the workspace
 * 3. Preserve system calendars (Primary, Tasks, Habits)
 *
 * This is a destructive operation and should be used with confirmation.
 */
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  try {
    // Verify user has access to this workspace
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has manage_workspace_settings permission
    const { data: hasPermission, error: permissionError } = await supabase.rpc(
      'has_workspace_permission',
      {
        p_user_id: user.id,
        p_ws_id: wsId,
        p_permission: 'manage_workspace_settings',
      }
    );

    if (permissionError) {
      console.error('Error checking permission:', permissionError);
      return NextResponse.json(
        { error: 'Error checking permission' },
        { status: 500 }
      );
    }

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to reset calendar data' },
        { status: 403 }
      );
    }

    // Start the reset process
    const results = {
      authTokensDeactivated: 0,
      calendarConnectionsDeleted: 0,
      eventsDeleted: 0,
    };

    // 1. Soft delete all calendar auth tokens (mark as inactive)
    const { data: deactivatedTokens, error: tokensError } = await supabase
      .from('calendar_auth_tokens')
      .update({ is_active: false })
      .eq('ws_id', wsId)
      .select('id');

    if (tokensError) {
      console.error('Error deactivating auth tokens:', tokensError);
    } else {
      results.authTokensDeactivated = deactivatedTokens?.length || 0;
    }

    // 2. Delete all calendar connections
    const { data: deletedConnections, error: connectionsError } = await supabase
      .from('calendar_connections')
      .delete()
      .eq('ws_id', wsId)
      .select('id');

    if (connectionsError) {
      console.error('Error deleting calendar connections:', connectionsError);
    } else {
      results.calendarConnectionsDeleted = deletedConnections?.length || 0;
    }

    // 3. Delete all calendar events in the workspace
    const { data: deletedEvents, error: eventsError } = await supabase
      .from('workspace_calendar_events')
      .delete()
      .eq('ws_id', wsId)
      .select('id');

    if (eventsError) {
      console.error('Error deleting calendar events:', eventsError);
    } else {
      results.eventsDeleted = deletedEvents?.length || 0;
    }

    // 4. Reset custom calendars (delete them, keep system calendars)
    const { error: customCalendarsError } = await supabase
      .from('workspace_calendars')
      .delete()
      .eq('ws_id', wsId)
      .eq('is_system', false);

    if (customCalendarsError) {
      console.error('Error deleting custom calendars:', customCalendarsError);
    }

    return NextResponse.json({
      success: true,
      message: 'Calendar data reset successfully',
      ...results,
    });
  } catch (error) {
    console.error('Calendar reset error:', error);
    return NextResponse.json(
      { error: 'Failed to reset calendar data' },
      { status: 500 }
    );
  }
}
