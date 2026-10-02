import { type calendar_v3, OAuth2Client } from '@tuturuuu/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { convertGoogleAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import {
  type GoogleColorContext,
  googleColorCompatibilityValue,
  resolveGoogleEventColor,
} from '@tuturuuu/utils/google-calendar-colors';
import {
  applyGoogleImport,
  type GoogleImportCapture,
} from '@tuturuuu/utils/google-calendar-import-fence';
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
  eventsDeferred?: number;
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

// Format event for database upsert and deletion
export const formatEventForDb = (
  event: calendar_v3.Schema$Event,
  ws_id: string,
  google_calendar_id?: string,
  colorContext: GoogleColorContext = {}
) => {
  const { start_at, end_at } = convertGoogleAllDayEvent(
    event.start?.dateTime || event.start?.date || '',
    event.end?.dateTime || event.end?.date || '',
    'auto'
  );

  return {
    google_event_id: event.id,
    google_calendar_id: google_calendar_id || 'primary',
    provider: 'google' as const,
    external_calendar_id: google_calendar_id || 'primary',
    external_event_id: event.id,
    title: event.summary || 'Untitled Event',
    description: event.description || '',
    start_at,
    end_at,
    location: event.location || '',
    color: googleColorCompatibilityValue(event.colorId),
    scheduling_metadata: {
      google_color: resolveGoogleEventColor(event, {
        ...colorContext,
        calendarId: google_calendar_id || 'primary',
      }),
      ...(event.eventType === 'workingLocation'
        ? {
            google_event_type: 'workingLocation',
            google_working_location_type:
              event.workingLocationProperties?.type ?? null,
            google_working_location_label:
              event.workingLocationProperties?.customLocation?.label ?? null,
          }
        : {}),
    },
    ws_id: ws_id,
    locked: true,
  };
};

// The capture must precede the Google read, never be created from an old payload.
const syncGoogleCalendarEventsForWorkspaceBatched = async (
  ws_id: string,
  events_to_sync: calendar_v3.Schema$Event[],
  calendarId: string,
  colorContext: GoogleColorContext,
  capture: GoogleImportCapture
): Promise<SyncResult> => {
  try {
    if (capture.wsId !== ws_id || capture.calendarId !== calendarId)
      throw new Error('Google import scope mismatch');
    const sbAdmin = await createAdminClient({ noCookie: true });
    const upserts = events_to_sync
      .filter((event) => event.status !== 'cancelled')
      .map((event) => formatEventForDb(event, ws_id, calendarId, colorContext));
    const tombstones = events_to_sync.flatMap((event) =>
      event.status === 'cancelled' && event.id ? [event.id] : []
    );
    let eventsSynced = 0;
    let eventsDeleted = 0;
    let eventsDeferred = 0;
    for (let i = 0; i < upserts.length; i += BATCH_SIZE) {
      const result = await applyGoogleImport(
        sbAdmin,
        capture,
        upserts.slice(i, i + BATCH_SIZE)
      );
      eventsSynced += result.inserted + result.updated;
      eventsDeferred += result.deferred;
    }
    for (let i = 0; i < tombstones.length; i += DELETE_BATCH_SIZE) {
      const result = await applyGoogleImport(
        sbAdmin,
        capture,
        [],
        tombstones.slice(i, i + DELETE_BATCH_SIZE)
      );
      eventsDeleted += result.deleted;
      eventsDeferred += result.deferred;
    }
    // Applied rows and deferred identities are durable before token advancement.
    await updateLastUpsert(ws_id, sbAdmin);
    return {
      ws_id,
      success: true,
      eventsSynced,
      eventsDeleted,
      eventsDeferred,
    };
  } catch {
    console.error('Google calendar guarded batch persistence failed');
    return {
      ws_id,
      success: false,
      error: 'Google calendar batch sync failed',
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
  calendarId?: string;
  colorContext?: GoogleColorContext;
  capture: GoogleImportCapture;
}) => {
  const {
    ws_id,
    events_to_sync: events,
    calendarId,
    colorContext,
    capture,
  } = payload;

  return syncGoogleCalendarEventsForWorkspaceBatched(
    ws_id,
    events,
    calendarId ?? 'primary',
    colorContext ?? {},
    capture
  );
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
    console.error(`Error storing sync token for calendar ${calendarId}:`, {
      wsId: ws_id,
      error,
    });
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
    console.error(`Error fetching sync token for calendar ${calendarId}:`, {
      wsId: ws_id,
      error: error.message,
    });
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
    console.error(`Error clearing sync token for calendar ${calendarId}:`, {
      wsId: ws_id,
      error: error.message,
    });
    throw error;
  }

  const result = data?.[0];
  if (!result?.success) {
    throw new Error(result?.message || 'Failed to clear sync token');
  }
};
