import { type calendar_v3, google } from '@tuturuuu/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  clearSyncToken,
  formatEventForDb,
  getGoogleAuthClient,
  getSyncToken,
  storeSyncToken,
} from '@tuturuuu/trigger/google-calendar-sync';
import type { GoogleColorContext } from '@tuturuuu/utils/google-calendar-colors';
import {
  captureGoogleImport,
  replayDeferredGoogleImports,
} from '@tuturuuu/utils/google-calendar-import-fence';
import { NextResponse } from 'next/server';
import { encryptGoogleSyncEvents } from '@/lib/workspace-encryption';
import { refreshGoogleColorContext } from './google-color-context';
import { incrementalActiveSync } from './google-guarded-sync-writes';
import { sanitizeWorkspaceCalendarEventFields } from './sync-field-limits';

type IncrementalSyncOptions = {
  syncDeletes?: boolean;
  colorContext?: GoogleColorContext;
};

export { getCancelledGoogleEventIds } from './google-sync-events';

export async function performIncrementalActiveSync(
  wsId: string,
  userId: string,
  calendarId: string = 'primary',
  startDate: Date,
  endDate: Date,
  globalEncryptedIds?: Set<string>,
  authTokenId?: string | null,
  sourceCalendarId?: string | null,
  options: IncrementalSyncOptions = {}
) {
  const syncStartTime = Date.now();
  const syncTokenKey = authTokenId
    ? `google:${authTokenId}:${calendarId}`
    : `google:legacy:${calendarId}`;

  // Initialize metrics tracking
  const metrics = {
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
  };

  // Convert string dates to Date objects if needed
  const startDateObj =
    startDate instanceof Date ? startDate : new Date(startDate);
  const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);

  console.debug('🔍 [DEBUG] performIncrementalActiveSync called with:', {
    wsId,
    userId,
    calendarId,
    authTokenId,
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
  });

  if (!wsId) {
    console.debug('❌ [DEBUG] Missing wsId, returning 400 error');
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

  const tokenOpStart = Date.now();
  console.debug('🔍 [DEBUG] Creating Supabase client...');
  const supabase = await createAdminClient();
  console.debug('✅ [DEBUG] Supabase client created successfully');

  // Build token query based on whether we have a specific authTokenId
  console.debug('🔍 [DEBUG] Querying calendar_auth_tokens table...');
  let tokenQuery = supabase
    .from('calendar_auth_tokens')
    .select('id, access_token, refresh_token')
    .eq('ws_id', wsId)
    .eq('provider', 'google')
    .eq('is_active', true);

  if (authTokenId) {
    // Use specific auth token for multi-account support
    tokenQuery = tokenQuery.eq('id', authTokenId);
    console.debug('🔍 [DEBUG] Using specific authTokenId:', authTokenId);
  } else {
    // Fallback to user_id query (legacy single-account behavior)
    tokenQuery = tokenQuery.eq('user_id', userId);
    console.debug('🔍 [DEBUG] Using userId for token lookup (legacy mode)');
  }

  const result = await tokenQuery.maybeSingle();

  metrics.tokenOperationsMs = Date.now() - tokenOpStart;

  console.debug('🔍 [DEBUG] Database query result:', {
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
      console.debug('❌ [DEBUG] No tokens found in database (PGRST116)');
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
    console.debug('❌ [DEBUG] Other database error, returning 500');
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

  console.debug('🔍 [DEBUG] Checking tokens...', {
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

  console.debug('✅ [DEBUG] Tokens found, creating Google auth client...');
  const auth = getGoogleAuthClient({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
  });
  const calendar = google.calendar({ version: 'v3', auth });
  console.debug('✅ [DEBUG] Google Calendar client created successfully');

  try {
    const colorContext = await refreshGoogleColorContext({
      calendar,
      calendarId,
      supabase,
      wsId,
      authTokenId,
    });
    console.debug('🔍 [DEBUG] Getting active sync token...');
    const syncToken = await getSyncToken(wsId, syncTokenKey);
    console.debug('🔍 [DEBUG] Sync token result:', {
      hasSyncToken: !!syncToken,
      calendarId,
    });

    metrics.syncTokenUsed = !!syncToken;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allEvents: any[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let pageCount = 0;
    let useDateRangeFallback = false;

    const importScope = {
      wsId,
      calendarId,
      authTokenId: googleTokens?.id ?? null,
    };
    await replayDeferredGoogleImports({
      client: supabase,
      calendar,
      scope: importScope,
      syncDeletes: options.syncDeletes,
      format: async (events) =>
        encryptGoogleSyncEvents(
          wsId,
          events.map((event) => {
            if (!event.id)
              throw new Error('Google event identifier is unavailable');
            return sanitizeWorkspaceCalendarEventFields({
              ...formatEventForDb(event, wsId, calendarId, colorContext),
              google_event_id: event.id,
              source_calendar_id: sourceCalendarId ?? null,
              external_updated_at: event.updated ?? null,
              last_synced_at: new Date().toISOString(),
              sync_error: null,
              sync_status: 'synced',
            });
          }),
          globalEncryptedIds
        ),
    });
    const capture = await captureGoogleImport(supabase, importScope);

    const googleApiFetchStart = Date.now();
    console.debug(
      '🔍 [DEBUG] Starting to fetch events from Google Calendar...'
    );

    // Try sync token first, fallback to date range if no sync token exists
    if (!syncToken) {
      console.debug(
        '🔍 [DEBUG] No sync token found, using date range fallback...'
      );
      useDateRangeFallback = true;
      metrics.syncTokenUsed = false;
    }

    do {
      pageCount++;
      console.debug(`🔍 [DEBUG] Fetching page ${pageCount}...`);

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
        console.debug('🔍 [DEBUG] Using date range parameters:', {
          timeMin: requestParams.timeMin,
          timeMax: requestParams.timeMax,
        });
      } else {
        // Use sync token for incremental sync
        requestParams.syncToken = syncToken ?? undefined;
        console.debug('🔍 [DEBUG] Using sync token for incremental sync');
      }

      try {
        metrics.apiCallsCount++;
        const res = await calendar.events.list(requestParams);
        metrics.pagesFetched++;

        console.debug('🔍 [DEBUG] Page', pageCount, 'results:', res.data);

        const events = res.data.items || [];
        metrics.eventsFetchedTotal += events.length;

        console.debug(`🔍 [DEBUG] Page ${pageCount} results:`, {
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
          metrics.retryCount++;
          console.debug(
            '🔍 [DEBUG] Sync token expired or invalid (410 error), falling back to date range...'
          );
          useDateRangeFallback = true;
          metrics.syncTokenUsed = false;

          // Clear the sync token from database since it's invalid
          try {
            await clearSyncToken(wsId, syncTokenKey);
            console.debug(
              '✅ [DEBUG] Invalid sync token cleared from database'
            );
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

    metrics.googleApiFetchMs = Date.now() - googleApiFetchStart;

    console.debug('✅ [DEBUG] Finished fetching events:', {
      totalEvents: allEvents.length,
      hasNextSyncToken: !!nextSyncToken,
      useDateRangeFallback,
    });

    if (allEvents.length > 0) {
      console.debug(
        '🔍 [DEBUG] Processing events with incrementalActiveSync...'
      );
      try {
        const result = await incrementalActiveSync(
          wsId,
          allEvents,
          startDateObj,
          endDateObj,
          calendarId,
          globalEncryptedIds,
          sourceCalendarId,
          { ...options, colorContext, capture }
        );
        metrics.eventProcessingMs = result.timings.eventProcessingMs;
        metrics.databaseWritesMs = result.timings.databaseWritesMs;
        metrics.batchCount = result.timings.batchCount;

        const syncDuration = Date.now() - syncStartTime;
        console.debug('✅ [DEBUG] incrementalActiveSync completed:', {
          eventsInserted: result.eventsInserted,
          eventsUpdated: result.eventsUpdated,
          eventsDeleted: result.eventsDeleted,
          durationMs: syncDuration,
          calendarId,
        });

        if (nextSyncToken) {
          console.debug('🔍 [DEBUG] Storing next sync token...');
          await storeSyncToken(wsId, nextSyncToken, new Date(), syncTokenKey);
          console.debug('✅ [DEBUG] Next sync token stored successfully');
        }

        return {
          ...result,
          metrics,
        };
      } catch (error) {
        console.error('❌ [DEBUG] Error in incrementalActiveSync:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }

    if (nextSyncToken) {
      console.debug('🔍 [DEBUG] No events but storing next sync token...');
      await storeSyncToken(wsId, nextSyncToken, new Date(), syncTokenKey);
      console.debug('✅ [DEBUG] Next sync token stored successfully');
    }

    console.debug('✅ [DEBUG] No events to process, returning empty result');
    return {
      eventsInserted: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      metrics,
      timings: {
        eventProcessingMs: 0,
        databaseWritesMs: 0,
        batchCount: 0,
      },
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
