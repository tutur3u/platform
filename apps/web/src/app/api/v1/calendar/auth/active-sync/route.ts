import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { updateLastUpsert } from '@tuturuuu/trigger/calendar-sync-coordination';
import { performIncrementalActiveSync } from '@/lib/calendar/incremental-active-sync';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const routeStartTime = Date.now();
  console.log('🔍 [DEBUG] POST /api/v1/calendar/auth/active-sync called');

  try {
    // 1. Get the wsId and start/end dates from the request
    const { wsId, startDate, endDate } = await request.json();

    console.log('🔍 [DEBUG] Request body parsed:', {
      wsId,
      startDate,
      endDate,
      hasWsId: !!wsId,
      hasStartDate: !!startDate,
      hasEndDate: !!endDate,
    });

    if (!wsId) {
      console.log('❌ [DEBUG] Missing wsId in request');
      return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
    }

    if (!startDate || !endDate) {
      console.log('❌ [DEBUG] Missing startDate or endDate in request');
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // 2. Create an admin client and get the user
    console.log('🔍 [DEBUG] Creating Supabase client...');
    const supabase = await createClient();
    console.log('✅ [DEBUG] Supabase client created');

    console.log('🔍 [DEBUG] Getting user from auth...');
    const {
      data: { user },
    } = await supabase.auth.getUser();

    console.log('🔍 [DEBUG] Auth result:', {
      hasUser: !!user,
      userId: user?.id,
    });

    if (!user) {
      console.log('❌ [DEBUG] User not authenticated');
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    console.log('🔍 [DEBUG] Creating admin client...');
    const sbAdmin = await createAdminClient();
    console.log('✅ [DEBUG] Admin client created');

    // 3. Insert a dashboard record
    console.log('🔍 [DEBUG] Inserting dashboard record...');
    const { data: insertDashboardData, error: insertDashboardError } =
      await sbAdmin
        .from('calendar_sync_dashboard')
        .insert({
          ws_id: wsId,
          start_time: startDate,
          end_time: endDate,
          status: 'running',
          type: 'active',
          inserted_events: 0,
          updated_events: 0,
          deleted_events: 0,
          triggered_by: user.id,
        })
        .select()
        .single();

    console.log('🔍 [DEBUG] Dashboard insert result:', {
      hasData: !!insertDashboardData,
      hasError: !!insertDashboardError,
      errorMessage: insertDashboardError?.message,
    });

    if (insertDashboardError) {
      console.log('❌ [DEBUG] Dashboard insert error:', insertDashboardError);
      return NextResponse.json(
        { error: insertDashboardError.message },
        { status: 500 }
      );
    }

    // 4. Get calendar connections to determine which calendars to sync
    console.log('🔍 [DEBUG] Fetching calendar connections...');
    const { data: calendarConnections, error: connectionsError } = await sbAdmin
      .from('calendar_connections')
      .select('calendar_id, is_enabled')
      .eq('ws_id', wsId)
      .eq('is_enabled', true);

    if (connectionsError) {
      console.log(
        '❌ [DEBUG] Error fetching calendar connections:',
        connectionsError
      );
      // Fall back to primary calendar if no connections found
    }

    // Determine which calendar IDs to sync from
    const calendarIds =
      calendarConnections && calendarConnections.length > 0
        ? calendarConnections.map((conn) => conn.calendar_id)
        : ['primary']; // Default to primary if no connections

    console.log('🔍 [DEBUG] Syncing from calendars:', calendarIds);

    // 5. Fetch eventsToUpsert and eventsToDelete from incremental active sync for each calendar
    // Process all calendars IN PARALLEL for much better performance
    console.log(
      `🔍 [DEBUG] Starting parallel sync for ${calendarIds.length} calendars...`
    );

    const syncPromises = calendarIds.map(async (calendarId) => {
      console.log(
        `🔍 [DEBUG] Calling performIncrementalActiveSync for calendar: ${calendarId}...`
      );

      try {
        const incrementalActiveSyncResult = await performIncrementalActiveSync(
          wsId,
          user.id,
          calendarId,
          startDate,
          endDate
        );

        // Check if the result is a NextResponse (error case) or a success object
        if (incrementalActiveSyncResult instanceof NextResponse) {
          console.log(
            `❌ [DEBUG] performIncrementalActiveSync returned error response for calendar ${calendarId}`
          );
          return { eventsInserted: 0, eventsUpdated: 0, eventsDeleted: 0 };
        }

        // Check if the result has an error property (another error case)
        if (
          incrementalActiveSyncResult &&
          typeof incrementalActiveSyncResult === 'object' &&
          'error' in incrementalActiveSyncResult
        ) {
          console.log(
            `❌ [DEBUG] performIncrementalActiveSync error for calendar ${calendarId}:`,
            incrementalActiveSyncResult.error
          );
          return { eventsInserted: 0, eventsUpdated: 0, eventsDeleted: 0 };
        }

        // Type assertion for the success case
        const syncResult = incrementalActiveSyncResult as {
          eventsInserted: number;
          eventsUpdated: number;
          eventsDeleted: number;
        };

        console.log(
          `✅ [DEBUG] performIncrementalActiveSync completed for calendar ${calendarId}:`,
          {
            eventsInserted: syncResult.eventsInserted,
            eventsUpdated: syncResult.eventsUpdated,
            eventsDeleted: syncResult.eventsDeleted,
          }
        );

        return syncResult;
      } catch (error) {
        console.error(
          `❌ [DEBUG] Error syncing calendar ${calendarId}:`,
          error
        );
        return { eventsInserted: 0, eventsUpdated: 0, eventsDeleted: 0 };
      }
    });

    // Wait for all calendar syncs to complete in parallel
    const syncResults = await Promise.all(syncPromises);

    // Aggregate results from all calendars
    const syncResult = syncResults.reduce(
      (totals, result) => ({
        eventsInserted: totals.eventsInserted + result.eventsInserted,
        eventsUpdated: totals.eventsUpdated + result.eventsUpdated,
        eventsDeleted: totals.eventsDeleted + result.eventsDeleted,
      }),
      { eventsInserted: 0, eventsUpdated: 0, eventsDeleted: 0 }
    );

    console.log(
      '✅ [DEBUG] All calendars synced in parallel, totals:',
      syncResult
    );

    console.log('🔍 [DEBUG] Updating last upsert...');
    await updateLastUpsert(wsId, supabase);
    console.log('✅ [DEBUG] Last upsert updated');

    if (DEV_MODE && insertDashboardData) {
      console.log('🔍 [DEBUG] Updating dashboard record...');
      const { error: updateDashboardError } = await sbAdmin
        .from('calendar_sync_dashboard')
        .update({
          inserted_events: syncResult.eventsInserted,
          updated_events: syncResult.eventsUpdated,
          deleted_events: syncResult.eventsDeleted,
          status: 'completed',
          end_time: new Date().toISOString(),
        })
        .eq('id', insertDashboardData.id);

      console.log('🔍 [DEBUG] Dashboard update result:', {
        hasError: !!updateDashboardError,
        errorMessage: updateDashboardError?.message,
      });

      if (updateDashboardError) {
        console.log('❌ [DEBUG] Dashboard update error:', updateDashboardError);
        return NextResponse.json(
          { error: updateDashboardError.message },
          { status: 500 }
        );
      }
    }

    const routeDuration = Date.now() - routeStartTime;
    console.log(
      `✅ [PERF] Active sync completed in ${routeDuration}ms for ${calendarIds.length} calendars`
    );
    console.log('✅ [DEBUG] Returning success response');

    return NextResponse.json({
      success: true,
      inserted: syncResult.eventsInserted,
      updated: syncResult.eventsUpdated,
      deleted: syncResult.eventsDeleted,
      durationMs: routeDuration,
    });
  } catch (error) {
    console.error('❌ [DEBUG] Route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
