import { task } from '@trigger.dev/sdk/v3';
import { getWorkspacesForSync, performFullSyncForWorkspace } from './google-calendar-sync';
import 'dotenv/config';

// Task for performing a full sync of a single workspace
export const googleCalendarFullSync = task({
  id: "google-calendar-full-sync",
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
        payload.calendarId || "primary",
        payload.ws_id,
        payload.access_token,
        payload.refresh_token
      );
      
      console.log(`[${payload.ws_id}] Full sync completed successfully. Synced ${events.length} events.`);
      
      return {
        ws_id: payload.ws_id,
        success: true,
        eventsSynced: events.length,
        events: events
      };
    } catch (error) {
      console.error(`[${payload.ws_id}] Error in full sync task:`, error);
      
      return {
        ws_id: payload.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        eventsSynced: 0
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
        
        const results: Array<{
          ws_id: string;
          handle?: any;
          error?: string;
          status: string;
        }> = [];
        
        for (const workspace of workspaces) {
          try {
            // Trigger individual workspace sync with concurrency key
            const handle = await googleCalendarFullSync.trigger(workspace, {
              concurrencyKey: workspace.ws_id, // Each workspace gets its own queue
            });
            
            results.push({
              ws_id: workspace.ws_id,
              handle,
              status: 'triggered'
            });
            
            console.log(`[${workspace.ws_id}] Full sync triggered`);
          } catch (error) {
            console.error(`[${workspace.ws_id}] Error triggering full sync:`, error);
            results.push({
              ws_id: workspace.ws_id,
              error: error instanceof Error ? error.message : 'Unknown error',
              status: 'failed'
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
