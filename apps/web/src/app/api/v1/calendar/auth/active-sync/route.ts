import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { updateLastUpsert } from '@tuturuuu/trigger/calendar-sync-coordination';
import { NextResponse } from 'next/server';
import { performIncrementalActiveSync } from '@/lib/calendar/incremental-active-sync';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

interface IncrementalSyncMetrics {
  tokenOperationsMs: number;
  googleApiFetchMs: number;
  eventProcessingMs: number;
  databaseWritesMs: number;
  apiCallsCount: number;
  pagesFetched: number;
  retryCount: number;
  eventsFetchedTotal: number;
  eventsFilteredOut: number;
  batchCount: number;
  syncTokenUsed: boolean;
}

interface IncrementalSyncResult {
  eventsInserted: number;
  eventsUpdated: number;
  eventsDeleted: number;
  metrics: IncrementalSyncMetrics;
}

export async function POST(request: Request): Promise<NextResponse> {
  const routeStartTime = Date.now();
  console.log('🔍 [DEBUG] POST /api/v1/calendar/auth/active-sync called');

  const timings = {
    authComplete: 0,
    dashboardInsert: 0,
    connectionsQuery: 0,
    syncComplete: 0,
    dashboardUpdate: 0,
  };

  // Initial Supabase client and user check
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.log(
      '❌ [DEBUG] User not authenticated or error fetching user:',
      userError
    );
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }
  timings.authComplete = Date.now() - routeStartTime;

  try {
    // 1. Get the wsId and start/end dates from the request
    const { wsId: wsIdParam, startDate, endDate } = await request.json();

    if (!wsIdParam) {
      console.log('❌ [DEBUG] Missing wsId in request');
      return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
    }

    const wsId = await normalizeWorkspaceId(wsIdParam);

    console.log('🔍 [DEBUG] Request body parsed:', {
      wsId,
      startDate,
      endDate,
    });

    if (!startDate || !endDate) {
      console.log('❌ [DEBUG] Missing startDate or endDate in request');
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

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

    timings.authComplete = Date.now() - routeStartTime;

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

    timings.dashboardInsert =
      Date.now() - routeStartTime - timings.authComplete;

    // 4. Get calendar connections to determine which calendars to sync
    console.log('🔍 [DEBUG] Fetching calendar connections...');
    const { data: calendarConnections, error: connectionsError } = await sbAdmin
      .from('calendar_connections')
      .select('calendar_id, is_enabled, auth_token_id')
      .eq('ws_id', wsId)
      .eq('is_enabled', true);

    if (connectionsError) {
      console.log(
        '❌ [DEBUG] Error fetching calendar connections:',
        connectionsError
      );
      // Fall back to primary calendar if no connections found
    }

    timings.connectionsQuery =
      Date.now() -
      routeStartTime -
      timings.authComplete -
      timings.dashboardInsert;

    // Build calendar data with auth tokens
    type CalendarWithToken = { calendarId: string; authTokenId: string | null };
    const calendarsToSync: CalendarWithToken[] =
      calendarConnections && calendarConnections.length > 0
        ? calendarConnections.map((conn) => ({
            calendarId: conn.calendar_id,
            authTokenId: conn.auth_token_id,
          }))
        : [{ calendarId: 'primary', authTokenId: null }]; // Default to primary if no connections

    const calendarIds = calendarsToSync.map((c) => c.calendarId);

    console.log('🔍 [DEBUG] Syncing from calendars:', calendarIds);

    // 5. Query ALL encrypted event IDs for this workspace BEFORE any calendar processing
    // This prevents race conditions where one calendar deletes an event before another checks encryption status
    console.log(
      '🔍 [DEBUG] Pre-caching all encrypted event IDs for workspace...'
    );
    const globalEncryptedIds = new Set<string>();
    const QUERY_BATCH_SIZE = 500;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: encryptedEvents, error: encryptedError } = await sbAdmin
        .from('workspace_calendar_events')
        .select('google_event_id')
        .eq('ws_id', wsId)
        .eq('is_encrypted', true)
        .not('google_event_id', 'is', null)
        .range(offset, offset + QUERY_BATCH_SIZE - 1);

      if (encryptedError) {
        console.warn(
          '❌ [DEBUG] Error fetching encrypted event IDs:',
          encryptedError
        );
        break;
      }

      if (encryptedEvents && encryptedEvents.length > 0) {
        encryptedEvents.forEach((e) => {
          if (e.google_event_id) {
            globalEncryptedIds.add(e.google_event_id);
          }
        });
        offset += QUERY_BATCH_SIZE;
        hasMore = encryptedEvents.length === QUERY_BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log('✅ [DEBUG] Global encrypted IDs cached:', {
      count: globalEncryptedIds.size,
    });

    // 6. Fetch eventsToUpsert and eventsToDelete from incremental active sync for each calendar
    // Process all calendars IN PARALLEL for much better performance
    console.log(
      `🔍 [DEBUG] Starting parallel sync for ${calendarsToSync.length} calendars...`
    );

    const syncPromises = calendarsToSync.map(
      async ({ calendarId, authTokenId }) => {
        console.log(
          `🔍 [DEBUG] Calling performIncrementalActiveSync for calendar: ${calendarId} (authTokenId: ${authTokenId})...`
        );

        try {
          const incrementalActiveSyncResult =
            await performIncrementalActiveSync(
              wsId,
              user.id,
              calendarId,
              startDate,
              endDate,
              globalEncryptedIds,
              authTokenId // Pass the specific auth token for this calendar
            );

          // Check if the result is a NextResponse (error case) or a success object
          if (incrementalActiveSyncResult instanceof NextResponse) {
            console.log(
              `❌ [DEBUG] performIncrementalActiveSync returned error response for calendar ${calendarId}`
            );
            return {
              eventsInserted: 0,
              eventsUpdated: 0,
              eventsDeleted: 0,
              metrics: {
                tokenOperationsMs: 0,
                googleApiFetchMs: 0,
                eventProcessingMs: 0,
                databaseWritesMs: 0,
                apiCallsCount: 0,
                pagesFetched: 0,
                retryCount: 0,
                eventsFetchedTotal: 0,
                eventsFilteredOut: 0,
                batchCount: 0,
                syncTokenUsed: false,
              },
            };
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
            return {
              eventsInserted: 0,
              eventsUpdated: 0,
              eventsDeleted: 0,
              metrics: {
                tokenOperationsMs: 0,
                googleApiFetchMs: 0,
                eventProcessingMs: 0,
                databaseWritesMs: 0,
                apiCallsCount: 0,
                pagesFetched: 0,
                retryCount: 0,
                eventsFetchedTotal: 0,
                eventsFilteredOut: 0,
                batchCount: 0,
                syncTokenUsed: false,
              },
            };
          }

          // Type assertion for the success case
          const syncResult =
            incrementalActiveSyncResult as IncrementalSyncResult;

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
          return {
            eventsInserted: 0,
            eventsUpdated: 0,
            eventsDeleted: 0,
            metrics: {
              tokenOperationsMs: 0,
              googleApiFetchMs: 0,
              eventProcessingMs: 0,
              databaseWritesMs: 0,
              apiCallsCount: 0,
              pagesFetched: 0,
              retryCount: 0,
              eventsFetchedTotal: 0,
              eventsFilteredOut: 0,
              batchCount: 0,
              syncTokenUsed: false,
            },
          };
        }
      }
    );

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

    // Aggregate metrics from all calendars
    const aggregatedMetrics = syncResults.reduce(
      (totals, result) => {
        const m = result.metrics;
        return {
          googleApiCalls: totals.googleApiCalls + (m?.apiCallsCount || 0),
          pagesFetched: totals.pagesFetched + (m?.pagesFetched || 0),
          retryCount: totals.retryCount + (m?.retryCount || 0),
          eventsFetched: totals.eventsFetched + (m?.eventsFetchedTotal || 0),
          eventsFiltered: totals.eventsFiltered + (m?.eventsFilteredOut || 0),
          batchCount: totals.batchCount + (m?.batchCount || 0),
          tokenOperationsMs:
            totals.tokenOperationsMs + (m?.tokenOperationsMs || 0),
          googleApiFetchMs:
            totals.googleApiFetchMs + (m?.googleApiFetchMs || 0),
          eventProcessingMs:
            totals.eventProcessingMs + (m?.eventProcessingMs || 0),
          databaseWritesMs:
            totals.databaseWritesMs + (m?.databaseWritesMs || 0),
          syncTokenUsed: totals.syncTokenUsed || m?.syncTokenUsed || false,
        };
      },
      {
        googleApiCalls: 0,
        pagesFetched: 0,
        retryCount: 0,
        eventsFetched: 0,
        eventsFiltered: 0,
        batchCount: 0,
        tokenOperationsMs: 0,
        googleApiFetchMs: 0,
        eventProcessingMs: 0,
        databaseWritesMs: 0,
        syncTokenUsed: false,
      }
    );

    console.log(
      '✅ [DEBUG] All calendars synced in parallel, totals:',
      syncResult
    );

    timings.syncComplete = Date.now() - routeStartTime;

    console.log('🔍 [DEBUG] Updating last upsert...');
    await updateLastUpsert(wsId, supabase);
    console.log('✅ [DEBUG] Last upsert updated');

    // Update dashboard with sync results (in both dev and production)
    if (insertDashboardData) {
      console.log('🔍 [DEBUG] Updating dashboard record...');
      const totalDuration = Date.now() - routeStartTime;
      const { error: updateDashboardError } = await sbAdmin
        .from('calendar_sync_dashboard')
        .update({
          inserted_events: syncResult.eventsInserted,
          updated_events: syncResult.eventsUpdated,
          deleted_events: syncResult.eventsDeleted,
          status: 'completed',
          end_time: new Date().toISOString(),
          // Timing breakdowns
          timing_total_ms: totalDuration,
          timing_google_api_fetch_ms: aggregatedMetrics.googleApiFetchMs,
          timing_token_operations_ms: aggregatedMetrics.tokenOperationsMs,
          timing_event_processing_ms: aggregatedMetrics.eventProcessingMs,
          timing_database_writes_ms: aggregatedMetrics.databaseWritesMs,
          // API performance metrics
          google_api_calls_count: aggregatedMetrics.googleApiCalls,
          google_api_pages_fetched: aggregatedMetrics.pagesFetched,
          google_api_retry_count: aggregatedMetrics.retryCount,
          // Data volume metrics
          events_fetched_total: aggregatedMetrics.eventsFetched,
          events_filtered_out: aggregatedMetrics.eventsFiltered,
          batch_count: aggregatedMetrics.batchCount,
          // Calendar-specific metrics
          calendar_ids_synced: calendarIds,
          calendar_connection_count: calendarIds.length,
          // Context
          triggered_from: 'ui_button',
          date_range_start: startDate,
          date_range_end: endDate,
          sync_token_used: aggregatedMetrics.syncTokenUsed,
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

    // Try to update dashboard with error details if we have a dashboard record
    try {
      const sbAdmin = await createAdminClient();
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Find most recent running sync for this workspace to update with error
      const { data: runningSyncs } = await sbAdmin
        .from('calendar_sync_dashboard')
        .select('id')
        .eq('status', 'running')
        .order('start_time', { ascending: false })
        .limit(1);

      if (runningSyncs && runningSyncs.length > 0) {
        await sbAdmin
          .from('calendar_sync_dashboard')
          .update({
            status: 'failed',
            end_time: new Date().toISOString(),
            error_message: errorMessage,
            error_type: 'unknown',
            error_stack_trace: errorStack,
            timing_total_ms: Date.now() - routeStartTime,
          })
          .eq('id', runningSyncs[0]!.id);
      }
    } catch (updateError) {
      console.error('Failed to update dashboard with error:', updateError);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
