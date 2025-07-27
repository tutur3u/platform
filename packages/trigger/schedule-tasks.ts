import { getWorkspacesForSync } from './google-calendar-sync';
import { schedulableTasksHelper } from './schedule-tasks-helper';
import { schedules, task } from '@trigger.dev/sdk/v3';

export const scheduleTask = task({
  id: 'schedule-task',
  queue: {
    concurrencyLimit: 10,
  },
  run: async (payload: { ws_id: string }) => {
    try {
      const result = await schedulableTasksHelper(payload.ws_id);

      if (!result.success) {
        throw new Error(result.error || 'Schedule tasks failed');
      }

      return {
        ws_id: payload.ws_id,
        success: true,
        ...result,
      };
    } catch (error) {
      console.error(`[${payload.ws_id}] Error in schedule task:`, error);

      return {
        ws_id: payload.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

export const scheduleTasksTrigger = schedules.task({
  id: 'schedule-tasks',
  cron: {
    pattern: '*/5 * * * *',
  },
  run: async () => {
    console.log('=== Starting schedule tasks trigger ===');

    try {
      const workspaces = await getWorkspacesForSync();

      console.log(
        `Found ${workspaces.length} workspaces to sync incrementally`
      );

      const results = [];

      for (const workspace of workspaces) {
        try {
          const handle = await scheduleTask.trigger(
            { ws_id: workspace.ws_id },
            {
              concurrencyKey: workspace.ws_id,
            }
          );

          results.push({
            ws_id: workspace.ws_id,
            handle,
            status: 'triggered',
          });
        } catch (error) {
          console.error(
            `[${workspace.ws_id}] Error triggering schedule task:`,
            error
          );
          results.push({
            ws_id: workspace.ws_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'failed',
          });
        }
      }

      console.log('=== Schedule tasks completed ===');
      return results;
    } catch (error) {
      console.error('Error in schedule tasks trigger:', error);
      throw error;
    }
  },
});
