import { getGoogleAuthClient, getSyncToken, getWorkspacesForSync, storeSyncToken, syncWorkspaceExtended } from "./google-calendar-sync";
import { google } from "googleapis";
import { schedules, task } from "@trigger.dev/sdk/v3";

import type { SyncOrchestratorResult } from "./google-calendar-sync";

async function performIncrementalSyncForWorkspace(
  calendarId = "primary",
  ws_id: string,
  access_token: string,
  refresh_token: string
) {
  const auth = getGoogleAuthClient({ access_token, refresh_token: refresh_token || undefined });
  const calendar = google.calendar({ version: "v3", auth });
  
  try {
    const syncToken = await getSyncToken(ws_id);
    let allEvents = [];
    let pageToken: string | undefined = undefined;
    let nextSyncToken: string | undefined = undefined;
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
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    if (allEvents.length > 0) {
      await syncWorkspaceExtended({ ws_id, events_to_sync: allEvents });
    }   
    
    if (nextSyncToken) {
      await storeSyncToken(ws_id, nextSyncToken, new Date());
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
    calendarId?: string; // Optional, defaults to "primary"
  }) => {
    console.log(`[${payload.ws_id}] Starting incremental sync task`);

    try {
      const events = await performIncrementalSyncForWorkspace(
        payload.calendarId || "primary", 
        payload.ws_id, 
        payload.access_token, 
        payload.refresh_token
      );

      console.log(`[${payload.ws_id}] Incremental sync completed successfully. Synced ${events.length} events.`);

      return {
        ws_id: payload.ws_id,
        success: true,
        eventsSynced: events.length,
        events: events
      };
    } catch (error) {
      console.error(`[${payload.ws_id}] Error triggering incremental sync:`, error);
      
      return {
        ws_id: payload.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        eventsSynced: 0
      };
    }
  }
});

export const googleCalendarIncrementalSyncOrchestrator = schedules.task({
  id: 'google-calendar-incremental-sync-orchestrator',
  cron: {
    // every 1 minute
    pattern: '* * * * *',
  },
  run: async () => {
    console.log('=== Starting incremental sync orchestrator ===');

    try {
      const workspaces = await getWorkspacesForSync();
      console.log(`Found ${workspaces.length} workspaces to sync incrementally`);

      const results: SyncOrchestratorResult[] = [];

      for (const workspace of workspaces) {
        try {
          const handle = await googleCalendarIncrementalSync.trigger(workspace, {
            concurrencyKey: workspace.ws_id,
          });

          results.push({
            ws_id: workspace.ws_id,
            handle,
            status: 'triggered'
          });
        } catch (error) {
          console.error(`[${workspace.ws_id}] Error triggering incremental sync:`, error);
          results.push({
            ws_id: workspace.ws_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'failed'
          });
        }
      }

      console.log('=== Incremental sync orchestrator completed ===');
      return results;
    } catch (error) {
      console.error('Error in incremental sync orchestrator:', error);
      throw error;
    }
  }
});

export const googleCalendarIncrementalSyncTasks = [
  googleCalendarIncrementalSync,
  googleCalendarIncrementalSyncOrchestrator,
];