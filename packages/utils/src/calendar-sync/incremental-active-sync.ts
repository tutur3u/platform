import { createClient } from '@tuturuuu/supabase/next/server';
import {
  formatEventForDb,
  getActiveSyncToken,
  getGoogleAuthClient,
  storeActiveSyncToken,
} from '@tuturuuu/trigger/google-calendar-sync';
import { calendar_v3, google } from 'googleapis';
import { NextResponse } from 'next/server';

/**
 * Filters events by date range and status using a pipe pattern
 */
function filterEventsByDateAndStatus(
  events: calendar_v3.Schema$Event[],
  startDate: Date,
  endDate: Date
) {
  // Convert string dates to Date objects if needed
  const startDateObj =
    startDate instanceof Date ? startDate : new Date(startDate);
  const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);

  console.log('🔍 [DEBUG] filterEventsByDateAndStatus called with:', {
    eventsCount: events.length,
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
  });

  const result = events
    .filter((event) => {
      // Filter by date range first
      const eventStart = event.start?.dateTime
        ? new Date(event.start.dateTime)
        : event.start?.date
          ? new Date(event.start.date)
          : null;

      const eventEnd = event.end?.dateTime
        ? new Date(event.end.dateTime)
        : event.end?.date
          ? new Date(event.end.date)
          : null;

      // If event has no start date, exclude it
      if (!eventStart) return false;

      // Check if event overlaps with the date range
      const eventEndTime = eventEnd || eventStart;
      return eventStart <= endDateObj && eventEndTime >= startDateObj;
    })
    .reduce(
      (acc, event) => {
        // Then filter by status
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

  console.log('✅ [DEBUG] filterEventsByDateAndStatus completed:', {
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
    const syncToken = await getActiveSyncToken(wsId);
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

      const requestParams: any = {
        calendarId,
        showDeleted: true,
        singleEvents: true,
        pageToken,
        maxResults: 2500,
      };

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
        requestParams.syncToken = syncToken;
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
      } catch (apiError: any) {
        // Handle sync token expiration or invalid sync token
        if (apiError.code === 410 && !useDateRangeFallback) {
          console.log(
            '🔍 [DEBUG] Sync token expired or invalid (410 error), falling back to date range...'
          );
          useDateRangeFallback = true;

          // Clear the sync token from database since it's invalid
          try {
            const sbAdmin = await createClient();
            await sbAdmin
              .from('google_calendar_active_sync_token')
              .delete()
              .eq('ws_id', wsId);
            console.log('✅ [DEBUG] Invalid sync token cleared from database');
          } catch (clearError) {
            console.error(
              '❌ [DEBUG] Error clearing invalid sync token:',
              clearError
            );
          }

          // Retry the same page with date range parameters
          pageCount--;
          continue;
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
      const result = await incrementalActiveSync(
        wsId,
        allEvents,
        startDateObj,
        endDateObj
      );

      console.log('✅ [DEBUG] incrementalActiveSync completed:', {
        eventsToUpsert: result.formattedEventsToUpsert?.length || 0,
        eventsToDelete: result.formattedEventsToDelete?.length || 0,
      });

      if (nextSyncToken) {
        console.log('🔍 [DEBUG] Storing next sync token...');
        await storeActiveSyncToken(wsId, nextSyncToken, new Date());
        console.log('✅ [DEBUG] Next sync token stored successfully');
      }

      return result;
    }

    if (nextSyncToken) {
      console.log('🔍 [DEBUG] No events but storing next sync token...');
      await storeActiveSyncToken(wsId, nextSyncToken, new Date());
      console.log('✅ [DEBUG] Next sync token stored successfully');
    }

    console.log('✅ [DEBUG] No events to process, returning empty result');
    return { formattedEventsToUpsert: [], formattedEventsToDelete: [] };
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
  endDate: Date
) {
  // Convert string dates to Date objects if needed
  const startDateObj =
    startDate instanceof Date ? startDate : new Date(startDate);
  const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);

  console.log('🔍 [DEBUG] incrementalActiveSync called with:', {
    wsId,
    eventsToSyncCount: eventsToSync.length,
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
  });

  // Use the pipe to filter events by date range first, then by status
  const { eventsToUpsert, eventsToDelete } = filterEventsByDateAndStatus(
    eventsToSync,
    startDateObj,
    endDateObj
  );

  console.log('🔍 [DEBUG] Events filtered:', {
    eventsToUpsertCount: eventsToUpsert.length,
    eventsToDeleteCount: eventsToDelete.length,
  });

  const formattedEventsToUpsert = eventsToUpsert.map((event) => {
    return formatEventForDb(event, wsId);
  });

  const formattedEventsToDelete = eventsToDelete.map((event) => {
    return formatEventForDb(event, wsId);
  });

  console.log('✅ [DEBUG] Events formatted:', {
    formattedEventsToUpsertCount: formattedEventsToUpsert.length,
    formattedEventsToDeleteCount: formattedEventsToDelete.length,
  });

  return { formattedEventsToUpsert, formattedEventsToDelete };
}
