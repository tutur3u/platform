import { task } from '@trigger.dev/sdk/v3';
import { google } from '@tuturuuu/google';
import dayjs from 'dayjs';
import {
  getGoogleAuthClient,
  getWorkspacesForSync,
  type SyncOrchestratorResult,
  storeSyncToken,
  syncWorkspaceBatched,
} from './google-calendar-sync';

export async function performFullSyncForWorkspace(
  calendarId = 'primary',
  ws_id: string,
  access_token: string,
  refresh_token: string
) {
  console.log(`[${ws_id}] Starting full sync for workspace`);

  const auth = getGoogleAuthClient({
    access_token,
    refresh_token: refresh_token || undefined,
  });
  const calendar = google.calendar({ version: 'v3', auth });

  const now = dayjs();
  // Expand date range to include past events and future events
  const timeMin = now.subtract(90, 'day'); // 90 days in the past
  const timeMax = now.add(180, 'day'); // 180 days in the future

  console.log(`[${ws_id}] Fetching events with date range:`, {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    dateRange: `${timeMin.format('YYYY-MM-DD')} to ${timeMax.format('YYYY-MM-DD')}`,
    totalDays: timeMax.diff(timeMin, 'day'),
  });

  try {
    const res = await calendar.events.list({
      calendarId,
      showDeleted: true,
      singleEvents: true,
      maxResults: 2500,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    });

    const events = res.data.items || [];
    const syncToken = res.data.nextSyncToken;

    console.log(`[${ws_id}] Google Calendar API response:`, {
      eventsCount: events.length,
      hasNextSyncToken: !!syncToken,
      hasNextPageToken: !!res.data.nextPageToken,
      timeZone: res.data.timeZone,
    });

    // Log sample events for debugging
    if (events.length > 0) {
      console.log(
        `[${ws_id}] Sample events:`,
        events.slice(0, 3).map((event) => ({
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          status: event.status,
        }))
      );
    }

    if (events.length > 0) {
      console.log(`[${ws_id}] Processing ${events.length} events...`);
      await syncWorkspaceBatched({ ws_id, events_to_sync: events });
      console.log(
        `[${ws_id}] Successfully synced ${events.length} events to database`
      );
    } else {
      console.log(`[${ws_id}] No events found in the specified date range`);
    }

    if (syncToken) {
      console.log(`[${ws_id}] Storing sync tokens...`);
      await storeSyncToken(ws_id, syncToken, new Date(), calendarId);
      console.log(`[${ws_id}] Sync tokens stored successfully`);
    } else {
      console.log(`[${ws_id}] No sync token received from Google Calendar API`);
    }

    return events;
  } catch (error) {
    console.error(`[${ws_id}] Error during full sync:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ws_id,
      calendarId,
    });
    throw error;
  }
}

// Task for performing a full sync of a single workspace
export const googleCalendarFullSync = task({
  id: 'google-calendar-full-sync',
  queue: {
    concurrencyLimit: 1, // Only one full sync per workspace at a time
  },
  run: async (payload: {
    ws_id: string;
    access_token: string;
    refresh_token: string;
    calendarId?: string; // Optional, defaults to "primary"
  }) => {
    console.log(`[${payload.ws_id}] Starting full sync task`);

    try {
      const events = await performFullSyncForWorkspace(
        payload.calendarId || 'primary',
        payload.ws_id,
        payload.access_token,
        payload.refresh_token
      );

      console.log(
        `[${payload.ws_id}] Full sync completed successfully. Synced ${events.length} events.`
      );

      return {
        ws_id: payload.ws_id,
        success: true,
        eventsSynced: events.length,
        events: events,
      };
    } catch (error) {
      console.error(`[${payload.ws_id}] Error in full sync task:`, error);

      return {
        ws_id: payload.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        eventsSynced: 0,
      };
    }
  },
});

export const googleCalendarFullSyncOrchestrator = task({
  id: 'google-calendar-full-sync-orchestrator',
  run: async () => {
    console.log('=== Starting extended sync orchestrator ===');

    try {
      const workspaces = await getWorkspacesForSync();
      console.log(`Found ${workspaces.length} workspaces to sync extended`);

      const results: SyncOrchestratorResult[] = [];

      for (const workspace of workspaces) {
        try {
          // Trigger individual workspace sync with concurrency key
          const handle = await googleCalendarFullSync.trigger(workspace, {
            concurrencyKey: `google-calendar-full-sync-${workspace.ws_id}`, // Each workspace gets its own queue
          });

          results.push({
            ws_id: workspace.ws_id,
            handle,
            status: 'triggered',
          });

          console.log(`[${workspace.ws_id}] Full sync triggered`);
        } catch (error) {
          console.error(
            `[${workspace.ws_id}] Error triggering full sync:`,
            error
          );
          results.push({
            ws_id: workspace.ws_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'failed',
          });
        }
      }

      console.log('=== Full sync orchestrator completed ===');
      return results;
    } catch (error) {
      console.error('Error in full sync orchestrator:', error);
      throw error;
    }
  },
});

// Export the task for registration
export const googleCalendarFullSyncTasks = [
  googleCalendarFullSync,
  googleCalendarFullSyncOrchestrator,
];
