import { type calendar_v3, google } from '@tuturuuu/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  clearSyncToken,
  formatEventForDb,
  getGoogleAuthClient,
  getSyncToken,
  storeSyncToken,
} from '@tuturuuu/trigger/google-calendar-sync';
import { NextResponse } from 'next/server';
import { sanitizeWorkspaceCalendarEventFields } from '@/lib/calendar/sync-field-limits';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { encryptGoogleSyncEvents } from '@/lib/workspace-encryption';

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

  serverLogger.debug('✅ [DEBUG] filterEventsByStatus completed:', {
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
  endDate: Date,
  globalEncryptedIds?: Set<string>,
  authTokenId?: string | null,
  sourceCalendarId?: string | null
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

  serverLogger.debug('🔍 [DEBUG] performIncrementalActiveSync called with:', {
    wsId,
    userId,
    calendarId,
    authTokenId,
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
  });

  if (!wsId) {
    serverLogger.debug('❌ [DEBUG] Missing wsId, returning 400 error');
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
  serverLogger.debug('🔍 [DEBUG] Creating Supabase client...');
  const supabase = await createAdminClient();
  serverLogger.debug('✅ [DEBUG] Supabase client created successfully');

  // Build token query based on whether we have a specific authTokenId
  serverLogger.debug('🔍 [DEBUG] Querying calendar_auth_tokens table...');
  let tokenQuery = supabase
    .from('calendar_auth_tokens')
    .select('access_token, refresh_token')
    .eq('ws_id', wsId);

  if (authTokenId) {
    // Use specific auth token for multi-account support
    tokenQuery = tokenQuery.eq('id', authTokenId);
    serverLogger.debug('🔍 [DEBUG] Using specific authTokenId:', authTokenId);
  } else {
    // Fallback to user_id query (legacy single-account behavior)
    tokenQuery = tokenQuery.eq('user_id', userId);
    serverLogger.debug(
      '🔍 [DEBUG] Using userId for token lookup (legacy mode)'
    );
  }

  const result = await tokenQuery.maybeSingle();

  metrics.tokenOperationsMs = Date.now() - tokenOpStart;

  serverLogger.debug('🔍 [DEBUG] Database query result:', {
    hasData: !!result.data,
    hasError: !!result.error,
    errorMessage: result.error?.message,
    errorCode: result.error?.code,
    dataKeys: result.data ? Object.keys(result.data) : null,
  });

  const googleTokens = result.data;
  const googleTokensError = result.error;

  if (googleTokensError) {
    serverLogger.error('❌ [DEBUG] Database query error:', {
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
      serverLogger.debug('❌ [DEBUG] No tokens found in database (PGRST116)');
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
    serverLogger.debug('❌ [DEBUG] Other database error, returning 500');
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

  serverLogger.debug('🔍 [DEBUG] Checking tokens...', {
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
    serverLogger.error('❌ [DEBUG] No Google access token found for user:', {
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

  serverLogger.debug('✅ [DEBUG] Tokens found, creating Google auth client...');
  const auth = getGoogleAuthClient({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
  });
  const calendar = google.calendar({ version: 'v3', auth });
  serverLogger.debug('✅ [DEBUG] Google Calendar client created successfully');

  try {
    serverLogger.debug('🔍 [DEBUG] Getting active sync token...');
    const syncToken = await getSyncToken(wsId, syncTokenKey);
    serverLogger.debug('🔍 [DEBUG] Sync token result:', {
      hasSyncToken: !!syncToken,
      syncToken,
      calendarId,
    });

    metrics.syncTokenUsed = !!syncToken;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allEvents: any[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    let pageCount = 0;
    let useDateRangeFallback = false;

    const googleApiFetchStart = Date.now();
    serverLogger.debug(
      '🔍 [DEBUG] Starting to fetch events from Google Calendar...'
    );

    // Try sync token first, fallback to date range if no sync token exists
    if (!syncToken) {
      serverLogger.debug(
        '🔍 [DEBUG] No sync token found, using date range fallback...'
      );
      useDateRangeFallback = true;
      metrics.syncTokenUsed = false;
    }

    do {
      pageCount++;
      serverLogger.debug(`🔍 [DEBUG] Fetching page ${pageCount}...`);

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
        serverLogger.debug('🔍 [DEBUG] Using date range parameters:', {
          timeMin: requestParams.timeMin,
          timeMax: requestParams.timeMax,
        });
      } else {
        // Use sync token for incremental sync
        requestParams.syncToken = syncToken ?? undefined;
        serverLogger.debug('🔍 [DEBUG] Using sync token for incremental sync');
      }

      try {
        metrics.apiCallsCount++;
        const res = await calendar.events.list(requestParams);
        metrics.pagesFetched++;

        serverLogger.debug('🔍 [DEBUG] Page', pageCount, 'results:', res.data);

        const events = res.data.items || [];
        metrics.eventsFetchedTotal += events.length;

        serverLogger.debug(`🔍 [DEBUG] Page ${pageCount} results:`, {
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
          serverLogger.debug(
            '🔍 [DEBUG] Sync token expired or invalid (410 error), falling back to date range...'
          );
          useDateRangeFallback = true;
          metrics.syncTokenUsed = false;

          // Clear the sync token from database since it's invalid
          try {
            await clearSyncToken(wsId, syncTokenKey);
            serverLogger.debug(
              '✅ [DEBUG] Invalid sync token cleared from database'
            );
          } catch (clearError) {
            serverLogger.error(
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

    serverLogger.debug('✅ [DEBUG] Finished fetching events:', {
      totalEvents: allEvents.length,
      hasNextSyncToken: !!nextSyncToken,
      useDateRangeFallback,
    });

    if (allEvents.length > 0) {
      serverLogger.debug(
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
          sourceCalendarId
        );
        metrics.eventProcessingMs = result.timings.eventProcessingMs;
        metrics.databaseWritesMs = result.timings.databaseWritesMs;
        metrics.batchCount = result.timings.batchCount;

        const syncDuration = Date.now() - syncStartTime;
        serverLogger.debug('✅ [DEBUG] incrementalActiveSync completed:', {
          eventsInserted: result.eventsInserted,
          eventsUpdated: result.eventsUpdated,
          eventsDeleted: result.eventsDeleted,
          durationMs: syncDuration,
          calendarId,
        });

        if (nextSyncToken) {
          serverLogger.debug('🔍 [DEBUG] Storing next sync token...');
          await storeSyncToken(wsId, nextSyncToken, new Date(), syncTokenKey);
          serverLogger.debug('✅ [DEBUG] Next sync token stored successfully');
        }

        return {
          ...result,
          metrics,
        };
      } catch (error) {
        serverLogger.error('❌ [DEBUG] Error in incrementalActiveSync:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }

    if (nextSyncToken) {
      serverLogger.debug('🔍 [DEBUG] No events but storing next sync token...');
      await storeSyncToken(wsId, nextSyncToken, new Date(), syncTokenKey);
      serverLogger.debug('✅ [DEBUG] Next sync token stored successfully');
    }

    serverLogger.debug(
      '✅ [DEBUG] No events to process, returning empty result'
    );
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
    serverLogger.error('❌ [DEBUG] Error in performIncrementalActiveSync:', {
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
  calendarId: string = 'primary',
  globalEncryptedIds?: Set<string>,
  sourceCalendarId?: string | null
) {
  const processingStart = Date.now();
  const supabase = await createAdminClient();

  // Convert string dates to Date objects if needed
  const startDateObj =
    startDate instanceof Date ? startDate : new Date(startDate);
  const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);

  serverLogger.debug('🔍 [DEBUG] incrementalActiveSync called with:', {
    wsId,
    calendarId,
    eventsToSyncCount: eventsToSync.length,
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
  });

  // Use the pipe to filter events by status
  const { eventsToUpsert, eventsToDelete } = filterEventsByStatus(eventsToSync);

  serverLogger.debug('🔍 [DEBUG] Events filtered:', {
    eventsToUpsertCount: eventsToUpsert.length,
    eventsToDeleteCount: eventsToDelete.length,
  });

  const formattedEventsToUpsert = eventsToUpsert.map((event) => {
    const formatted = formatEventForDb(event, wsId, calendarId);
    return sanitizeWorkspaceCalendarEventFields({
      ...formatted,
      provider: 'google' as const,
      external_calendar_id: calendarId,
      external_event_id: event.id,
      source_calendar_id: sourceCalendarId ?? null,
    });
  });

  const formattedEventsToDelete = eventsToDelete.map((event) => {
    const formatted = formatEventForDb(event, wsId, calendarId);
    return {
      ...formatted,
      provider: 'google' as const,
      external_calendar_id: calendarId,
      external_event_id: event.id,
      source_calendar_id: sourceCalendarId ?? null,
    };
  });

  const eventProcessingMs = Date.now() - processingStart;

  serverLogger.debug('✅ [DEBUG] Events formatted:', {
    formattedEventsToUpsertCount: formattedEventsToUpsert.length,
    formattedEventsToDeleteCount: formattedEventsToDelete.length,
  });

  const dbWriteStart = Date.now();
  let batchCount = 0;

  // IMPORTANT: Query for encrypted events BEFORE any deletes happen
  // This prevents race conditions where an event is deleted by one calendar
  // before another calendar checks its encryption status
  const preDeleteEncryptedIds: Set<string> = new Set();
  if (formattedEventsToUpsert && formattedEventsToUpsert.length > 0) {
    const externalEventIds = formattedEventsToUpsert
      .map((e) => e.external_event_id)
      .filter((id): id is string => !!id);

    if (externalEventIds.length > 0) {
      // Query in batches to avoid URL length limits
      const QUERY_BATCH_SIZE = 100;
      for (let i = 0; i < externalEventIds.length; i += QUERY_BATCH_SIZE) {
        const batchIds = externalEventIds.slice(i, i + QUERY_BATCH_SIZE);
        const { data: existingEvents, error: batchError } = await supabase
          .from('workspace_calendar_events')
          .select('external_event_id, google_event_id, is_encrypted')
          .eq('ws_id', wsId)
          .eq('provider', 'google')
          .eq('external_calendar_id', calendarId)
          .in('external_event_id', batchIds);

        if (batchError) {
          serverLogger.error('Failed to query encrypted Google events batch', {
            wsId,
            calendarId,
            batchSize: batchIds.length,
            error: batchError,
          });
          // Continue to next batch - this is best-effort caching
          continue;
        }

        if (existingEvents) {
          existingEvents
            .filter((e) => e.is_encrypted === true)
            .forEach((e) => {
              const externalId = e.external_event_id ?? e.google_event_id;
              if (externalId) {
                preDeleteEncryptedIds.add(externalId);
              }
            });
        }
      }
      serverLogger.debug('🔍 [DEBUG] Pre-delete encrypted IDs cached:', {
        count: preDeleteEncryptedIds.size,
      });
    }
  }

  if (formattedEventsToDelete && formattedEventsToDelete.length > 0) {
    serverLogger.debug('🔍 [DEBUG] Deleting events...');
    const validEventIds = formattedEventsToDelete
      .map((e) => e.external_event_id ?? e.google_event_id)
      .filter((id): id is string => id !== null && id !== undefined);

    if (validEventIds.length > 0) {
      // Batch deletes to avoid "URI too long" error when deleting many events
      const DELETE_BATCH_SIZE = 50; // Conservative batch size for URL safety
      const deleteBatches = [];

      for (let i = 0; i < validEventIds.length; i += DELETE_BATCH_SIZE) {
        deleteBatches.push(validEventIds.slice(i, i + DELETE_BATCH_SIZE));
      }

      batchCount += deleteBatches.length;

      serverLogger.debug(
        `🔍 [DEBUG] Deleting ${validEventIds.length} events in ${deleteBatches.length} batches`
      );

      // Process delete batches sequentially to avoid overwhelming the database
      for (let i = 0; i < deleteBatches.length; i++) {
        const batch = deleteBatches[i];
        if (!batch) continue;

        // Delete events marked as cancelled by Google
        // Encryption preservation is handled by encryptGoogleSyncEvents which
        // uses the global cache to re-encrypt any re-inserted events
        const { error: deleteError } = await supabase
          .from('workspace_calendar_events')
          .delete()
          .eq('ws_id', wsId)
          .eq('provider', 'google')
          .eq('external_calendar_id', calendarId)
          .in('external_event_id', batch);

        serverLogger.debug(
          `🔍 [DEBUG] Delete batch ${i + 1}/${deleteBatches.length}:`,
          {
            hasError: !!deleteError,
            batchSize: batch.length,
            errorMessage: deleteError?.message,
          }
        );

        if (deleteError) {
          serverLogger.debug(
            `❌ [DEBUG] Delete batch ${i + 1} error:`,
            deleteError
          );
          throw new Error(deleteError.message);
        }
      }

      serverLogger.debug(
        '✅ [DEBUG] All delete batches completed successfully'
      );
    }
  }

  let upsertResult: { inserted: number; updated: number } = {
    inserted: 0,
    updated: 0,
  };

  if (formattedEventsToUpsert && formattedEventsToUpsert.length > 0) {
    serverLogger.debug('🔍 [DEBUG] Upserting events...');

    // Encrypt events that need it (events that are already encrypted in DB)
    // This implements "decrypt, compare, re-encrypt" - incoming Google data
    // is encrypted for events that have E2EE enabled
    // Use global cache if provided (avoids race condition with parallel calendar syncs)
    // Otherwise use local pre-delete cache (avoids race within single calendar sync)
    const encryptedIdsToUse =
      globalEncryptedIds && globalEncryptedIds.size > 0
        ? globalEncryptedIds
        : preDeleteEncryptedIds;

    serverLogger.debug('🔍 [DEBUG] Using encrypted IDs cache:', {
      source:
        globalEncryptedIds && globalEncryptedIds.size > 0 ? 'global' : 'local',
      count: encryptedIdsToUse.size,
    });

    const eventsWithEncryption = await encryptGoogleSyncEvents(
      wsId,
      formattedEventsToUpsert as Array<{
        google_event_id: string;
        external_event_id: string;
        title: string;
        description?: string;
        location?: string | null;
      }>,
      encryptedIdsToUse
    );

    serverLogger.debug('🔍 [DEBUG] Events encrypted:', {
      total: eventsWithEncryption.length,
      encrypted: eventsWithEncryption.filter((e) => e.is_encrypted).length,
    });

    // Batch large event sets for better performance
    const BATCH_SIZE = 500; // Process 500 events at a time
    const batches = [];

    for (let i = 0; i < eventsWithEncryption.length; i += BATCH_SIZE) {
      batches.push(eventsWithEncryption.slice(i, i + BATCH_SIZE));
    }

    batchCount += batches.length;

    serverLogger.debug(
      `🔍 [DEBUG] Processing ${eventsWithEncryption.length} events in ${batches.length} batches`
    );

    // Process batches in parallel for better performance
    const batchPromises = batches.map(async (batch, index) => {
      const batchStartTime = Date.now();
      const { data: batchData, error: batchError } = await supabase.rpc(
        'upsert_calendar_events_and_count',
        { events: batch }
      );

      const batchDuration = Date.now() - batchStartTime;
      serverLogger.debug(
        `✅ [DEBUG] Batch ${index + 1}/${batches.length} completed in ${batchDuration}ms`
      );

      if (batchError) {
        serverLogger.debug(`❌ [DEBUG] Batch ${index + 1} error:`, batchError);
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

    serverLogger.debug(
      '✅ [DEBUG] All batches completed. Total upsert result:',
      upsertResult
    );
  }

  const databaseWritesMs = Date.now() - dbWriteStart;

  return {
    eventsInserted: upsertResult?.inserted || 0,
    eventsUpdated: upsertResult?.updated || 0,
    eventsDeleted: formattedEventsToDelete?.length || 0,
    timings: {
      eventProcessingMs,
      databaseWritesMs,
      batchCount,
    },
  };
}
