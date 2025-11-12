import { type calendar_v3, google } from '@tuturuuu/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  clearSyncToken,
  formatEventForDb,
  getGoogleAuthClient,
  getSyncToken,
  storeSyncToken,
} from '@tuturuuu/trigger/google-calendar-sync';
import { NextResponse } from 'next/server';

/**
 * Filters events by date range and status using a pipe pattern
 */
function filterEventsByStatus(events: calendar_v3.Schema$Event[]) {
  const result = events.reduce(
    (acc, event) => {
      // Filter by status
      if (event.status === 'cancelled') {
        acc.eventsToDelete.push(event);
      } else {
        acc.eventsToUpsert.push(event);
      }
      return acc;
    },
    {
      eventsToUpsert: [] as calendar_v3.Schema$Event[],
      eventsToDelete: [] as calendar_v3.Schema$Event[],
    }
  );

  console.log('✅ [DEBUG] filterEventsByStatus completed:', {
    originalEventsCount: events.length,
    eventsToUpsertCount: result.eventsToUpsert.length,
    eventsToDeleteCount: result.eventsToDelete.length,
  });

  return result;
}

export async function performIncrementalActiveSync(
  wsId: string,
  userId: string,
  calendarId: string = 'primary',
  startDate: Date,
  endDate: Date
) {
  const syncStartTime = Date.now();

  // Convert string dates to Date objects if needed
  const startDateObj =
    startDate instanceof Date ? startDate : new Date(startDate);
  const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);

  console.log('🔍 [DEBUG] performIncrementalActiveSync called with:', {
    wsId,
    userId,
    calendarId,
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
  });

  if (!wsId) {
    console.log('❌ [DEBUG] Missing wsId, returning 400 error');
    return NextResponse.json(
      {
        error: 'Failed to fetch Google Calendar events',
        statusCode: 400,
        googleError: 'Missing workspace ID',
        details: {
          hasAccessToken: false,
          hasRefreshToken: false,
          userId: userId,
          reason: 'No workspace ID provided',
        },
      },
      { status: 400 }
    );
  }

  console.log('🔍 [DEBUG] Creating Supabase client...');
  const supabase = await createClient();
  console.log('✅ [DEBUG] Supabase client created successfully');

  console.log('🔍 [DEBUG] Querying calendar_auth_tokens table...');
  const result = await supabase
    .from('calendar_auth_tokens')
    .select('access_token, refresh_token')
    .eq('user_id', userId)
    .eq('ws_id', wsId) // Add ws_id to the query
    .maybeSingle();

  console.log('🔍 [DEBUG] Database query result:', {
    hasData: !!result.data,
    hasError: !!result.error,
    errorMessage: result.error?.message,
    errorCode: result.error?.code,
    dataKeys: result.data ? Object.keys(result.data) : null,
  });

  const googleTokens = result.data;
  const googleTokensError = result.error;

  if (googleTokensError) {
    console.error('❌ [DEBUG] Database query error:', {
      error: googleTokensError,
      message: googleTokensError.message,
      details: googleTokensError.details,
      hint: googleTokensError.hint,
      code: googleTokensError.code,
      userId: userId,
      wsId,
    });

    // If it's a not found error, handle it gracefully
    if (googleTokensError.code === 'PGRST116') {
      console.log('❌ [DEBUG] No tokens found in database (PGRST116)');
      return NextResponse.json(
        {
          error: 'Failed to fetch Google Calendar events',
          statusCode: 401,
          googleError: 'Google Calendar not authenticated',
          details: {
            hasAccessToken: false,
            hasRefreshToken: false,
            userId: userId,
            reason: 'No tokens found in database',
          },
        },
        { status: 401 }
      );
    }

    // For other database errors, return 500
    console.log('❌ [DEBUG] Other database error, returning 500');
    return NextResponse.json(
      {
        error: 'Failed to fetch Google Calendar events',
        statusCode: 500,
        googleError: 'Database error',
        details: {
          tokenError: googleTokensError.message,
          hasAccessToken: false,
          hasRefreshToken: false,
          userId: userId,
          errorCode: googleTokensError.code,
        },
      },
      { status: 500 }
    );
  }

  console.log('🔍 [DEBUG] Checking tokens...', {
    hasTokens: !!googleTokens,
    hasAccessToken: !!googleTokens?.access_token,
    hasRefreshToken: !!googleTokens?.refresh_token,
  });

  // Type assertion for the tokens
  const tokens = googleTokens as {
    access_token: string;
    refresh_token: string;
  } | null;

  if (!tokens?.access_token) {
    console.error('❌ [DEBUG] No Google access token found for user:', {
      userId: userId,
      hasAccessToken: !!tokens?.access_token,
      hasRefreshToken: !!tokens?.refresh_token,
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch Google Calendar events',
        statusCode: 401,
        googleError: 'Google Calendar not authenticated',
        details: {
          hasAccessToken: false,
          hasRefreshToken: !!tokens?.refresh_token,
          userId: userId,
          reason: 'Access token is empty',
        },
      },
      { status: 401 }
    );
  }

  console.log('✅ [DEBUG] Tokens found, creating Google auth client...');
  const auth = getGoogleAuthClient({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
  });
  const calendar = google.calendar({ version: 'v3', auth });
  console.log('✅ [DEBUG] Google Calendar client created successfully');

  try {
    console.log('🔍 [DEBUG] Getting active sync token...');
    const syncToken = await getSyncToken(wsId);
    console.log('🔍 [DEBUG] Sync token result:', {
      hasSyncToken: !!syncToken,
      syncToken,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allEvents: any[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let pageCount = 0;
    let useDateRangeFallback = false;

    console.log('🔍 [DEBUG] Starting to fetch events from Google Calendar...');

    // Try sync token first, fallback to date range if no sync token exists
    if (!syncToken) {
      console.log(
        '🔍 [DEBUG] No sync token found, using date range fallback...'
      );
      useDateRangeFallback = true;
    }

    do {
      pageCount++;
      console.log(`🔍 [DEBUG] Fetching page ${pageCount}...`);

      const requestParams = {
        calendarId,
        showDeleted: true,
        singleEvents: true,
        pageToken: pageToken ?? undefined,
        maxResults: 2500,
      } as calendar_v3.Params$Resource$Events$List;

      if (useDateRangeFallback) {
        // Use date range parameters when no sync token exists
        requestParams.timeMin = startDateObj.toISOString();
        requestParams.timeMax = endDateObj.toISOString();
        console.log('🔍 [DEBUG] Using date range parameters:', {
          timeMin: requestParams.timeMin,
          timeMax: requestParams.timeMax,
        });
      } else {
        // Use sync token for incremental sync
        requestParams.syncToken = syncToken ?? undefined;
        console.log('🔍 [DEBUG] Using sync token for incremental sync');
      }

      try {
        const res = await calendar.events.list(requestParams);

        console.log('🔍 [DEBUG] Page', pageCount, 'results:', res.data);

        const events = res.data.items || [];
        console.log(`🔍 [DEBUG] Page ${pageCount} results:`, {
          eventsCount: events.length,
          hasNextPageToken: !!res.data.nextPageToken,
          hasNextSyncToken: !!res.data.nextSyncToken,
          totalEventsSoFar: allEvents.length + events.length,
          useDateRangeFallback,
        });

        allEvents = allEvents.concat(events);
        nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
        pageToken = res.data.nextPageToken ?? undefined;
      } catch (apiError: unknown) {
        // Handle sync token expiration or invalid sync token
        if (
          apiError &&
          typeof apiError === 'object' &&
          'code' in apiError &&
          apiError.code === 410 &&
          !useDateRangeFallback
        ) {
          console.log(
            '🔍 [DEBUG] Sync token expired or invalid (410 error), falling back to date range...'
          );
          useDateRangeFallback = true;

          // Clear the sync token from database since it's invalid
          try {
            await clearSyncToken(wsId);
            console.log('✅ [DEBUG] Invalid sync token cleared from database');
          } catch (clearError) {
            console.error(
              '❌ [DEBUG] Error clearing invalid sync token:',
              clearError
            );
          }

          // Retry the same page with date range parameters
          pageCount--;
        } else {
          // Re-throw other errors
          throw apiError;
        }
      }
    } while (pageToken);

    console.log('✅ [DEBUG] Finished fetching events:', {
      totalEvents: allEvents.length,
      hasNextSyncToken: !!nextSyncToken,
      useDateRangeFallback,
    });

    if (allEvents.length > 0) {
      console.log('🔍 [DEBUG] Processing events with incrementalActiveSync...');
      try {
        const result = await incrementalActiveSync(
          wsId,
          allEvents,
          startDateObj,
          endDateObj,
          calendarId
        );

        const syncDuration = Date.now() - syncStartTime;
        console.log('✅ [DEBUG] incrementalActiveSync completed:', {
          eventsInserted: result.eventsInserted,
          eventsUpdated: result.eventsUpdated,
          eventsDeleted: result.eventsDeleted,
          durationMs: syncDuration,
          calendarId,
        });

        if (nextSyncToken) {
          console.log('🔍 [DEBUG] Storing next sync token...');
          await storeSyncToken(wsId, nextSyncToken, new Date());
          console.log('✅ [DEBUG] Next sync token stored successfully');
        }

        return result;
      } catch (error) {
        console.error('❌ [DEBUG] Error in incrementalActiveSync:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }

    if (nextSyncToken) {
      console.log('🔍 [DEBUG] No events but storing next sync token...');
      await storeSyncToken(wsId, nextSyncToken, new Date());
      console.log('✅ [DEBUG] Next sync token stored successfully');
    }

    console.log('✅ [DEBUG] No events to process, returning empty result');
    return {
      eventsInserted: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
    };
  } catch (error) {
    console.error('❌ [DEBUG] Error in performIncrementalActiveSync:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      wsId,
      userId,
    });
    throw error;
  }
}

async function incrementalActiveSync(
  wsId: string,
  eventsToSync: calendar_v3.Schema$Event[],
  startDate: Date,
  endDate: Date,
  calendarId: string = 'primary'
) {
  const supabase = await createClient();

  // Convert string dates to Date objects if needed
  const startDateObj =
    startDate instanceof Date ? startDate : new Date(startDate);
  const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);

  console.log('🔍 [DEBUG] incrementalActiveSync called with:', {
    wsId,
    calendarId,
    eventsToSyncCount: eventsToSync.length,
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
  });

  // Use the pipe to filter events by status
  const { eventsToUpsert, eventsToDelete } = filterEventsByStatus(eventsToSync);

  console.log('🔍 [DEBUG] Events filtered:', {
    eventsToUpsertCount: eventsToUpsert.length,
    eventsToDeleteCount: eventsToDelete.length,
  });

  const formattedEventsToUpsert = eventsToUpsert.map((event) => {
    return formatEventForDb(event, wsId, calendarId);
  });

  const formattedEventsToDelete = eventsToDelete.map((event) => {
    return formatEventForDb(event, wsId, calendarId);
  });

  console.log('✅ [DEBUG] Events formatted:', {
    formattedEventsToUpsertCount: formattedEventsToUpsert.length,
    formattedEventsToDeleteCount: formattedEventsToDelete.length,
  });

  if (formattedEventsToDelete && formattedEventsToDelete.length > 0) {
    console.log('🔍 [DEBUG] Deleting events...');
    const validEventIds = formattedEventsToDelete
      .map((e) => e.google_event_id)
      .filter((id): id is string => id !== null && id !== undefined);

    if (validEventIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('workspace_calendar_events')
        .delete()
        .in('google_event_id', validEventIds)
        .eq('ws_id', wsId);

      console.log('🔍 [DEBUG] Delete result:', {
        hasError: !!deleteError,
        errorMessage: deleteError?.message,
      });

      if (deleteError) {
        console.log('❌ [DEBUG] Delete error:', deleteError);
        throw new Error(deleteError.message);
      }
    }
  }

  let upsertResult: { inserted: number; updated: number } = {
    inserted: 0,
    updated: 0,
  };

  if (formattedEventsToUpsert && formattedEventsToUpsert.length > 0) {
    console.log('🔍 [DEBUG] Upserting events...');

    // Batch large event sets for better performance
    const BATCH_SIZE = 500; // Process 500 events at a time
    const batches = [];

    for (let i = 0; i < formattedEventsToUpsert.length; i += BATCH_SIZE) {
      batches.push(formattedEventsToUpsert.slice(i, i + BATCH_SIZE));
    }

    console.log(
      `🔍 [DEBUG] Processing ${formattedEventsToUpsert.length} events in ${batches.length} batches`
    );

    // Process batches in parallel for better performance
    const batchPromises = batches.map(async (batch, index) => {
      const batchStartTime = Date.now();
      const { data: batchData, error: batchError } = await supabase.rpc(
        'upsert_calendar_events_and_count',
        { events: batch }
      );

      const batchDuration = Date.now() - batchStartTime;
      console.log(
        `✅ [DEBUG] Batch ${index + 1}/${batches.length} completed in ${batchDuration}ms`
      );

      if (batchError) {
        console.log(`❌ [DEBUG] Batch ${index + 1} error:`, batchError);
        throw new Error(batchError.message);
      }

      return batchData as { inserted: number; updated: number };
    });

    const batchResults = await Promise.all(batchPromises);

    // Aggregate results from all batches
    upsertResult = batchResults.reduce(
      (totals, result) => ({
        inserted: totals.inserted + (result?.inserted || 0),
        updated: totals.updated + (result?.updated || 0),
      }),
      { inserted: 0, updated: 0 }
    );

    console.log(
      '✅ [DEBUG] All batches completed. Total upsert result:',
      upsertResult
    );
  }

  return {
    eventsInserted: upsertResult?.inserted || 0,
    eventsUpdated: upsertResult?.updated || 0,
    eventsDeleted: formattedEventsToDelete?.length || 0,
  };
}
