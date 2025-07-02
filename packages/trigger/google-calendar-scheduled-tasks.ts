import { schedules, task } from '@trigger.dev/sdk/v3';
import {
  getWorkspacesForSync,
  syncWorkspaceExtended,
  syncWorkspaceImmediate,
} from './google-calendar-sync.js';
import 'dotenv/config';

// Task for immediate sync of a single workspace
export const googleCalendarWorkspaceImmediateSync = task({
  id: 'google-calendar-workspace-immediate-sync',
  queue: {
    concurrencyLimit: 1, // Only one sync per workspace at a time
  },
  run: async (payload: {
    ws_id: string;
    access_token: string;
    refresh_token?: string;
  }) => {
    console.log(`[${payload.ws_id}] Starting immediate sync task`);
    return await syncWorkspaceImmediate(payload);
  },
});

// Task for extended sync of a single workspace
export const googleCalendarWorkspaceExtendedSync = task({
  id: 'google-calendar-workspace-extended-sync',
  queue: {
    concurrencyLimit: 1, // Only one sync per workspace at a time
  },
  run: async (payload: {
    ws_id: string;
    access_token: string;
    refresh_token?: string;
  }) => {
    console.log(`[${payload.ws_id}] Starting extended sync task`);
    return await syncWorkspaceExtended(payload);
  },
});

// Orchestrator task that runs every 1 minute and triggers individual workspace immediate syncs
export const googleCalendarImmediateOrchestrator = schedules.task({
  id: 'google-calendar-immediate-orchestrator',
  cron: {
    // every 1 minute
    pattern: '* * * * *',
  },
  run: async () => {
    console.log('=== Starting immediate sync orchestrator ===');

    try {
      const workspaces = await getWorkspacesForSync();
      console.log(`Found ${workspaces.length} workspaces to sync immediately`);

      const results = [];

      for (const workspace of workspaces) {
        try {
          // Trigger individual workspace sync with concurrency key
          const handle = await googleCalendarWorkspaceImmediateSync.trigger(
            workspace,
            {
              concurrencyKey: workspace.ws_id, // Each workspace gets its own queue
            }
          );

          results.push({
            ws_id: workspace.ws_id,
            handle,
            status: 'triggered',
          });

          console.log(`[${workspace.ws_id}] Immediate sync triggered`);
        } catch (error) {
          console.error(
            `[${workspace.ws_id}] Error triggering immediate sync:`,
            error
          );
          results.push({
            ws_id: workspace.ws_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'failed',
          });
        }
      }

      console.log('=== Immediate sync orchestrator completed ===');
      return results;
    } catch (error) {
      console.error('Error in immediate sync orchestrator:', error);
      throw error;
    }
  },
});

// Orchestrator task that runs every 10 minutes and triggers individual workspace extended syncs
export const googleCalendarExtendedOrchestrator = schedules.task({
  id: 'google-calendar-extended-orchestrator',
  cron: {
    // every 10 minutes
    pattern: '*/10 * * * *',
  },
  run: async () => {
    console.log('=== Starting extended sync orchestrator ===');

    try {
      const workspaces = await getWorkspacesForSync();
      console.log(`Found ${workspaces.length} workspaces to sync extended`);

      const results = [];

      for (const workspace of workspaces) {
        try {
          // Trigger individual workspace sync with concurrency key
          const handle = await googleCalendarWorkspaceExtendedSync.trigger(
            workspace,
            {
              concurrencyKey: workspace.ws_id, // Each workspace gets its own queue
            }
          );

          results.push({
            ws_id: workspace.ws_id,
            handle,
            status: 'triggered',
          });

          console.log(`[${workspace.ws_id}] Extended sync triggered`);
        } catch (error) {
          console.error(
            `[${workspace.ws_id}] Error triggering extended sync:`,
            error
          );
          results.push({
            ws_id: workspace.ws_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'failed',
          });
        }
      }

      console.log('=== Extended sync orchestrator completed ===');
      return results;
    } catch (error) {
      console.error('Error in extended sync orchestrator:', error);
      throw error;
    }
  },
});

// Export all tasks for registration
export const googleCalendarTasks = [
  googleCalendarWorkspaceImmediateSync,
  googleCalendarWorkspaceExtendedSync,
  googleCalendarImmediateOrchestrator,
  googleCalendarExtendedOrchestrator,
];
