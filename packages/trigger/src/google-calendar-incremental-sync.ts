import { task } from '@trigger.dev/sdk/v3';
import { type calendar_v3, google } from '@tuturuuu/google';
import {
  getGoogleAuthClient,
  getSyncToken,
  storeSyncToken,
  syncWorkspaceBatched,
} from './google-calendar-sync';

async function performIncrementalSyncForWorkspace(
  calendarId = 'primary',
  ws_id: string,
  access_token: string,
  refresh_token: string
) {
  const auth = getGoogleAuthClient({
    access_token,
    refresh_token: refresh_token || undefined,
  });
  const calendarAuth = auth as unknown as calendar_v3.Options['auth'];
  const calendar = google.calendar({ version: 'v3', auth: calendarAuth });

  try {
    const syncToken = await getSyncToken(ws_id, calendarId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allEvents: any[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const res = await calendar.events.list({
        calendarId,
        syncToken: syncToken || undefined,
        showDeleted: true,
        singleEvents: true,
        pageToken,
        maxResults: 2500,
      });
      const events = res.data.items || [];
      allEvents = allEvents.concat(events);
      nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    if (allEvents.length > 0) {
      await syncWorkspaceBatched({ ws_id, events_to_sync: allEvents });
    }

    if (nextSyncToken) {
      await storeSyncToken(ws_id, nextSyncToken, new Date(), calendarId);
    }

    return allEvents;
  } catch (error) {
    console.error('Error fetching sync token:', error);
    throw error;
  }
}

export const googleCalendarIncrementalSync = task({
  id: 'google-calendar-incremental-sync',
  queue: {
    concurrencyLimit: 1,
  },
  run: async (payload: {
    ws_id: string;
    access_token: string;
    refresh_token: string;
    calendarId?: string;
  }) => {
    console.log(`[${payload.ws_id}] Starting incremental sync task`);

    try {
      const events = await performIncrementalSyncForWorkspace(
        payload.calendarId || 'primary',
        payload.ws_id,
        payload.access_token,
        payload.refresh_token
      );

      console.log(
        `[${payload.ws_id}] Incremental sync completed successfully. Synced ${events.length} events.`
      );

      return {
        ws_id: payload.ws_id,
        success: true,
        eventsSynced: events.length,
        events: events,
      };
    } catch (error) {
      console.error(
        `[${payload.ws_id}] Error triggering incremental sync:`,
        error
      );

      return {
        ws_id: payload.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        eventsSynced: 0,
      };
    }
  },
});

export const googleCalendarIncrementalSyncTasks = [
  googleCalendarIncrementalSync,
];
