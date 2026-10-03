import type { calendar_v3 } from '@tuturuuu/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { formatEventForDb } from '@tuturuuu/trigger/google-calendar-sync';
import type { GoogleColorContext } from '@tuturuuu/utils/google-calendar-colors';
import {
  applyGoogleImport,
  type GoogleImportCapture,
} from '@tuturuuu/utils/google-calendar-import-fence';
import { encryptGoogleSyncEvents } from '../workspace-encryption';
import {
  filterEventsByStatus,
  getCancelledGoogleEventIds,
} from './google-sync-events';
import { sanitizeWorkspaceCalendarEventFields } from './sync-field-limits';

type IncrementalSyncOptions = {
  syncDeletes?: boolean;
  colorContext?: GoogleColorContext;
  capture: GoogleImportCapture;
};

export async function incrementalActiveSync(
  wsId: string,
  eventsToSync: calendar_v3.Schema$Event[],
  startDate: Date,
  endDate: Date,
  calendarId: string = 'primary',
  globalEncryptedIds: Set<string> | undefined,
  sourceCalendarId: string | null | undefined,
  options: IncrementalSyncOptions
) {
  const processingStart = Date.now();
  const supabase = await createAdminClient();

  // Convert string dates to Date objects if needed
  const startDateObj =
    startDate instanceof Date ? startDate : new Date(startDate);
  const endDateObj = endDate instanceof Date ? endDate : new Date(endDate);

  console.debug('🔍 [DEBUG] incrementalActiveSync called with:', {
    wsId,
    calendarId,
    eventsToSyncCount: eventsToSync.length,
    startDate: startDateObj.toISOString(),
    endDate: endDateObj.toISOString(),
  });

  // Use the pipe to filter events by status
  const { eventsToUpsert, eventsToDelete } = filterEventsByStatus(eventsToSync);

  console.debug('🔍 [DEBUG] Events filtered:', {
    eventsToUpsertCount: eventsToUpsert.length,
    eventsToDeleteCount: eventsToDelete.length,
  });

  const formattedEventsToUpsert = eventsToUpsert.map((event) => {
    const formatted = formatEventForDb(
      event,
      wsId,
      calendarId,
      options.colorContext
    );
    return sanitizeWorkspaceCalendarEventFields({
      ...formatted,
      provider: 'google' as const,
      external_calendar_id: calendarId,
      external_event_id: event.id,
      source_calendar_id: sourceCalendarId ?? null,
      external_updated_at: event.updated ?? null,
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      sync_status: 'synced',
    });
  });

  // Google deletion tombstones often contain only an id and status. Avoid
  // formatting them as full events because they have no start/end payload.
  const googleEventIdsToDelete = getCancelledGoogleEventIds(eventsToDelete);

  const eventProcessingMs = Date.now() - processingStart;

  console.debug('✅ [DEBUG] Events formatted:', {
    formattedEventsToUpsertCount: formattedEventsToUpsert.length,
    formattedEventsToDeleteCount: googleEventIdsToDelete.length,
  });

  const dbWriteStart = Date.now();
  let batchCount = 0;
  let deletedCount = 0;

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
          console.error('Failed to query encrypted Google events batch', {
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
      console.debug('🔍 [DEBUG] Pre-delete encrypted IDs cached:', {
        count: preDeleteEncryptedIds.size,
      });
    }
  }

  let deferredCount = 0;
  if (options.syncDeletes !== false && googleEventIdsToDelete.length > 0) {
    const result = await applyGoogleImport(
      supabase,
      options.capture,
      [],
      googleEventIdsToDelete
    );
    deletedCount = result.deleted;
    deferredCount += result.deferred;
    batchCount++;
  }

  let upsertResult: { inserted: number; updated: number } = {
    inserted: 0,
    updated: 0,
  };

  if (formattedEventsToUpsert && formattedEventsToUpsert.length > 0) {
    console.debug('🔍 [DEBUG] Upserting events...');

    // Encrypt events that need it (events that are already encrypted in DB)
    // This implements "decrypt, compare, re-encrypt" - incoming Google data
    // is encrypted for events that have E2EE enabled
    // Use global cache if provided (avoids race condition with parallel calendar syncs)
    // Otherwise use local pre-delete cache (avoids race within single calendar sync)
    const encryptedIdsToUse =
      globalEncryptedIds && globalEncryptedIds.size > 0
        ? globalEncryptedIds
        : preDeleteEncryptedIds;

    console.debug('🔍 [DEBUG] Using encrypted IDs cache:', {
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

    console.debug('🔍 [DEBUG] Events encrypted:', {
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

    console.debug(
      `🔍 [DEBUG] Processing ${eventsWithEncryption.length} events in ${batches.length} batches`
    );

    const batchResults = [];
    for (const batch of batches) {
      const result = await applyGoogleImport(supabase, options.capture, batch);
      deferredCount += result.deferred;
      batchResults.push(result);
    }

    // Aggregate results from all batches
    upsertResult = batchResults.reduce(
      (totals, result) => ({
        inserted: totals.inserted + (result?.inserted || 0),
        updated: totals.updated + (result?.updated || 0),
      }),
      { inserted: 0, updated: 0 }
    );

    console.debug(
      '✅ [DEBUG] All batches completed. Total upsert result:',
      upsertResult
    );
  }

  const databaseWritesMs = Date.now() - dbWriteStart;

  return {
    eventsInserted: upsertResult?.inserted || 0,
    eventsUpdated: upsertResult?.updated || 0,
    eventsDeleted: deletedCount,
    eventsDeferred: deferredCount,
    timings: {
      eventProcessingMs,
      databaseWritesMs,
      batchCount,
    },
  };
}
