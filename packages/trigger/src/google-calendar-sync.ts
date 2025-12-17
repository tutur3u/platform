import { type calendar_v3, OAuth2Client } from '@tuturuuu/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { convertGoogleAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { updateLastUpsert } from './calendar-sync-coordination';

// Batch processing configuration
const BATCH_SIZE = 100; // Process 100 events at a time for upserts
const DELETE_BATCH_SIZE = 50; // Process 50 events at a time for deletes

// Define the sync result type
type SyncResult = {
  ws_id: string;
  success: boolean;
  eventsSynced?: number;
  eventsDeleted?: number;
  error?: string;
};

export type SyncOrchestratorResult = {
  ws_id: string;
  handle?: any;
  error?: string;
  status: string;
};

export const getGoogleAuthClient = (tokens: {
  access_token: string;
  refresh_token?: string;
}) => {
  const oauth2Client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

const getColorFromGoogleColorId = (colorId?: string): string => {
  const colorMap: Record<string, string> = {
    '1': 'RED',
    '2': 'GREEN',
    '3': 'GRAY',
    '4': 'PINK',
    '5': 'YELLOW',
    '6': 'ORANGE',
    '8': 'CYAN',
    '9': 'PURPLE',
    '10': 'INDIGO',
    '11': 'BLUE',
  };
  return colorId && colorMap[colorId] ? colorMap[colorId] : 'BLUE';
};

// Format event for database upsert and deletion
export const formatEventForDb = (
  event: calendar_v3.Schema$Event,
  ws_id: string,
  google_calendar_id?: string
) => {
  const { start_at, end_at } = convertGoogleAllDayEvent(
    event.start?.dateTime || event.start?.date || '',
    event.end?.dateTime || event.end?.date || '',
    'auto'
  );

  return {
    google_event_id: event.id,
    google_calendar_id: google_calendar_id || 'primary',
    title: event.summary || 'Untitled Event',
    description: event.description || '',
    start_at,
    end_at,
    location: event.location || '',
    color: getColorFromGoogleColorId(event.colorId ?? undefined),
    ws_id: ws_id,
    locked: true,
  };
};

// Core sync function for a single workspace with batch processing
const syncGoogleCalendarEventsForWorkspaceBatched = async (
  ws_id: string,
  events_to_sync: calendar_v3.Schema$Event[]
): Promise<SyncResult> => {
  console.log(
    `[${ws_id}] Syncing Google Calendar events for workspace with batching. Total events: ${events_to_sync.length}`
  );

  try {
    const sbAdmin = await createAdminClient({ noCookie: true });
    console.log(`[${ws_id}] Created admin client successfully`);

    const rawEventsToUpsert: calendar_v3.Schema$Event[] = [];
    const rawEventsToDelete: calendar_v3.Schema$Event[] = [];

    for (const event of events_to_sync) {
      if (event.status === 'cancelled' && event.id) {
        rawEventsToDelete.push(event);
      } else {
        rawEventsToUpsert.push(event);
      }
    }

    console.log(`[${ws_id}] Event categorization:`, {
      totalEvents: events_to_sync.length,
      eventsToUpsert: rawEventsToUpsert.length,
      eventsToDelete: rawEventsToDelete.length,
    });

    // Format events for upsert
    const formattedEvents = rawEventsToUpsert.map((event) =>
      formatEventForDb(event, ws_id)
    );

    // Format events for deletion
    const formattedEventsToDelete = rawEventsToDelete.map((event) =>
      formatEventForDb(event, ws_id)
    );

    console.log(`[${ws_id}] Formatted events:`, {
      formattedEventsToUpsert: formattedEvents.length,
      formattedEventsToDelete: formattedEventsToDelete.length,
    });

    let totalUpserted = 0;
    let totalDeleted = 0;

    // Process upserts in batches
    if (formattedEvents.length > 0) {
      console.log(`[${ws_id}] Starting upsert batches...`);
      for (let i = 0; i < formattedEvents.length; i += BATCH_SIZE) {
        const batch = formattedEvents.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

        console.log(
          `[${ws_id}] Processing upsert batch ${batchNumber} (${batch.length} events)`
        );

        const { error } = await sbAdmin
          .from('workspace_calendar_events')
          .upsert(batch, {
            onConflict: 'ws_id,google_event_id',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`[${ws_id}] Error upserting batch ${batchNumber}:`, {
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            batchSize: batch.length,
          });
          throw error;
        }

        totalUpserted += batch.length;
        console.log(
          `[${ws_id}] Successfully upserted batch ${batchNumber} (${batch.length} events)`
        );
      }
    } else {
      console.log(`[${ws_id}] No events to upsert`);
    }

    // Process deletes in batches
    if (formattedEventsToDelete.length > 0) {
      console.log(`[${ws_id}] Starting delete batches...`);
      for (
        let i = 0;
        i < formattedEventsToDelete.length;
        i += DELETE_BATCH_SIZE
      ) {
        const batch = formattedEventsToDelete.slice(i, i + DELETE_BATCH_SIZE);
        const batchNumber = Math.floor(i / DELETE_BATCH_SIZE) + 1;

        console.log(
          `[${ws_id}] Processing delete batch ${batchNumber} (${batch.length} events)`
        );

        // Create delete conditions for this batch
        const deleteConditions = batch
          .map(
            (e) =>
              `and(ws_id.eq.${ws_id},google_event_id.eq.${e.google_event_id ?? ''})`
          )
          .join(',');

        const { error: deleteError } = await sbAdmin
          .from('workspace_calendar_events')
          .delete()
          .or(deleteConditions);

        if (deleteError) {
          console.error(`[${ws_id}] Error deleting batch ${batchNumber}:`, {
            error: deleteError.message,
            code: deleteError.code,
            details: deleteError.details,
            hint: deleteError.hint,
            batchSize: batch.length,
          });
          throw deleteError;
        }

        totalDeleted += batch.length;
        console.log(
          `[${ws_id}] Successfully deleted batch ${batchNumber} (${batch.length} events)`
        );
      }
    } else {
      console.log(`[${ws_id}] No events to delete`);
    }

    // Update lastUpsert timestamp after successful sync
    console.log(`[${ws_id}] Updating lastUpsert timestamp...`);
    await updateLastUpsert(ws_id, sbAdmin);
    console.log(`[${ws_id}] LastUpsert timestamp updated successfully`);

    console.log(`[${ws_id}] Sync completed successfully:`, {
      totalUpserted,
      totalDeleted,
      success: true,
    });

    return {
      ws_id,
      success: true,
      eventsSynced: totalUpserted,
      eventsDeleted: totalDeleted,
    };
  } catch (error) {
    console.error(
      `[${ws_id}] Error in syncGoogleCalendarEventsForWorkspaceBatched:`,
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        ws_id,
        totalEvents: events_to_sync.length,
      }
    );
    return {
      ws_id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Export the batched sync function for testing
export { syncGoogleCalendarEventsForWorkspaceBatched };

// Get workspace by ws_id
export const getWorkspaceTokensByWsId = async (ws_id: string) => {
  try {
    const sbAdmin = await createAdminClient({ noCookie: true });
    const { data: tokens, error } = await sbAdmin
      .from('calendar_auth_tokens')
      .select('ws_id, access_token, refresh_token')
      .eq('ws_id', ws_id);

    if (error) {
      console.log('Error fetching workspace tokens:', error);
      return null;
    }

    return tokens?.[0] || null;
  } catch (error) {
    console.log('Error in getWorkspaceTokensByWsId:', error);
    return null;
  }
};

// Get all workspaces that need sync
export const getWorkspacesForSync = async () => {
  try {
    const sbAdmin = await createAdminClient({ noCookie: true });

    const { data: tokens, error } = await sbAdmin
      .from('calendar_auth_tokens')
      .select('ws_id, access_token, refresh_token')
      .not('access_token', 'is', null);

    if (error) {
      console.log('Error fetching workspaces for sync:', error);
      return [];
    }

    return tokens || [];
  } catch (error) {
    console.log('Error in getWorkspacesForSync:', error);
    return [];
  }
};

// Sync a single workspace with batch processing
export const syncWorkspaceBatched = async (payload: {
  ws_id: string;
  events_to_sync: calendar_v3.Schema$Event[];
}) => {
  const { ws_id, events_to_sync: events } = payload;

  return syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);
};

// Store the sync token in the calendar_sync_states table
export const storeSyncToken = async (
  ws_id: string,
  syncToken: string,
  _lastSyncedAt: Date,
  calendarId: string = 'primary'
) => {
  const sbAdmin = await createAdminClient({ noCookie: true });

  const { data, error } = await sbAdmin.rpc('atomic_sync_token_operation', {
    p_ws_id: ws_id,
    p_calendar_id: calendarId,
    p_operation: 'update',
    p_sync_token: syncToken,
  });

  if (error) {
    console.error(
      `[${ws_id}] Error storing sync token for calendar ${calendarId}`,
      error
    );
    throw error;
  }

  const result = data?.[0];
  if (!result?.success) {
    throw new Error(result?.message || 'Failed to store sync token');
  }
};

export const getSyncToken = async (
  ws_id: string,
  calendarId: string = 'primary'
): Promise<string | null> => {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin.rpc('atomic_sync_token_operation', {
    p_ws_id: ws_id,
    p_calendar_id: calendarId,
    p_operation: 'get',
  });

  if (error) {
    console.error(
      `[${ws_id}] Error fetching sync token for calendar ${calendarId}:`,
      error.message
    );
    return null;
  }

  const result = data?.[0];
  return result?.success ? result.sync_token : null;
};

export const clearSyncToken = async (
  ws_id: string,
  calendarId: string = 'primary'
) => {
  const sbAdmin = await createAdminClient({ noCookie: true });

  const { data, error } = await sbAdmin.rpc('atomic_sync_token_operation', {
    p_ws_id: ws_id,
    p_calendar_id: calendarId,
    p_operation: 'clear',
  });

  if (error) {
    console.error(
      `[${ws_id}] Error clearing sync token for calendar ${calendarId}:`,
      error.message
    );
    throw error;
  }

  const result = data?.[0];
  if (!result?.success) {
    throw new Error(result?.message || 'Failed to clear sync token');
  }
};
