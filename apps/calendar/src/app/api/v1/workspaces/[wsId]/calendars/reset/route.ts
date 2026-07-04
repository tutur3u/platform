import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

interface Params {
  wsId: string;
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
export const POST = withSessionAuth<Params>(
  async (_request, { supabase, user }, { wsId: rawWsId }) => {
    try {
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);
      const sbAdmin = await createAdminClient({ noCookie: true });
      const calendarsClient = sbAdmin.schema('private');

      // Check if user has manage_workspace_settings permission
      const { data: hasPermission, error: permissionError } =
        await supabase.rpc('has_workspace_permission', {
          p_user_id: user.id,
          p_ws_id: wsId,
          p_permission: 'manage_workspace_settings',
        });

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
      const { data: deactivatedTokens, error: tokensError } = await sbAdmin
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
      const { data: deletedConnections, error: connectionsError } =
        await sbAdmin
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
      const { data: deletedEvents, error: eventsError } = await sbAdmin
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
      const { error: customCalendarsError } = await calendarsClient
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
  },
  { allowAppSessionAuth: { targetApp: 'calendar' } }
);
