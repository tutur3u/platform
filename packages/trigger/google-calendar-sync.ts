import { OAuth2Client } from '@tuturuuu/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { convertGoogleAllDayEvent } from '@tuturuuu/ui/hooks/calendar-utils';
import { updateLastUpsert } from '@tuturuuu/utils/calendar-sync-coordination';
import type { calendar_v3 } from 'googleapis/build/src/apis/calendar';

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
const formatEventForDb = (event: calendar_v3.Schema$Event, ws_id: string) => {
  const { start_at, end_at } = convertGoogleAllDayEvent(
    event.start?.dateTime || event.start?.date || '',
    event.end?.dateTime || event.end?.date || '',
    'auto'
  );

  return {
    google_event_id: event.id,
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
    `Syncing Google Calendar events for workspace ${ws_id} with batching`
  );

  try {
    const sbAdmin = await createAdminClient({ noCookie: true });

    const rawEventsToUpsert: calendar_v3.Schema$Event[] = [];
    const rawEventsToDelete: calendar_v3.Schema$Event[] = [];

    for (const event of events_to_sync) {
      if (event.status === 'cancelled' && event.id) {
        rawEventsToDelete.push(event);
      } else {
        rawEventsToUpsert.push(event);
      }
    }

    // Format events for upsert
    const formattedEvents = rawEventsToUpsert.map((event) =>
      formatEventForDb(event, ws_id)
    );

    // Format events for deletion
    const formattedEventsToDelete = rawEventsToDelete.map((event) =>
      formatEventForDb(event, ws_id)
    );

    let totalUpserted = 0;
    let totalDeleted = 0;

    // Process upserts in batches
    for (let i = 0; i < formattedEvents.length; i += BATCH_SIZE) {
      const batch = formattedEvents.slice(i, i + BATCH_SIZE);

      const { error } = await sbAdmin
        .from('workspace_calendar_events')
        .upsert(batch, {
          onConflict: 'ws_id,google_event_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.log(
          `Error upserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
          error
        );
        throw error;
      }

      totalUpserted += batch.length;
      console.log(
        `Upserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} events)`
      );
    }

    // Process deletes in batches
    for (
      let i = 0;
      i < formattedEventsToDelete.length;
      i += DELETE_BATCH_SIZE
    ) {
      const batch = formattedEventsToDelete.slice(i, i + DELETE_BATCH_SIZE);

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
        console.log(
          `Error deleting batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1}:`,
          deleteError
        );
        throw deleteError;
      }

      totalDeleted += batch.length;
      console.log(
        `Deleted batch ${Math.floor(i / DELETE_BATCH_SIZE) + 1} (${batch.length} events)`
      );
    }

    // Update lastUpsert timestamp after successful sync
    await updateLastUpsert(ws_id, sbAdmin);

    return {
      ws_id,
      success: true,
      eventsSynced: totalUpserted,
      eventsDeleted: totalDeleted,
    };
  } catch (error) {
    console.log('Error in syncGoogleCalendarEventsForWorkspaceBatched:', error);
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
      .from('workspaces')
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

export const storeSyncToken = async (
  ws_id: string,
  syncToken: string,
  lastSyncedAt: Date
) => {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { error } = await sbAdmin.from('calendar_sync_states').upsert(
    {
      ws_id,
      calendar_id: 'primary',
      sync_token: syncToken,
      last_synced_at: lastSyncedAt.toISOString(),
    },
    {
      onConflict: 'ws_id,calendar_id',
    }
  );

  if (error) {
    console.error(
      `[${ws_id}] Error storing sync token for calendar primary:`,
      error
    );
    throw error;
  }
};

export const getSyncToken = async (ws_id: string) => {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data: syncToken, error } = await sbAdmin
    .from('calendar_sync_states')
    .select('sync_token')
    .eq('ws_id', ws_id)
    .eq('calendar_id', 'primary');

  if (error) {
    console.error(
      `[${ws_id}] Error fetching sync token for calendar primary:`,
      error
    );
    throw error;
  }

  return syncToken?.[0]?.sync_token || null;
};
