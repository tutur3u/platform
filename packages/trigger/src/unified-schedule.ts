/**
 * Unified Scheduler Background Job
 *
 * Runs the unified scheduler for all workspaces on a schedule.
 * This ensures habits and tasks are scheduled in a coordinated manner:
 * - Habits are scheduled first (by priority)
 * - Tasks are scheduled second (by deadline + priority)
 * - Urgent tasks can bump lower-priority habit events
 *
 * Schedule: Runs every hour
 */

import { schedules, task } from '@trigger.dev/sdk/v3';

import { getWorkspacesForSync } from './google-calendar-sync';
import { unifiedScheduleHelper } from './unified-schedule-helper';

/**
 * Task to schedule a single workspace
 */
export const unifiedScheduleTask = task({
  id: 'unified-schedule-task',
  queue: {
    concurrencyLimit: 5, // Limit concurrent workspace scheduling
  },
  run: async (payload: {
    ws_id: string;
    windowDays?: number;
    forceReschedule?: boolean;
  }) => {
    try {
      const result = await unifiedScheduleHelper(payload.ws_id, {
        windowDays: payload.windowDays,
        forceReschedule: payload.forceReschedule,
      });

      if (!result.success) {
        throw new Error(result.error || 'Unified schedule failed');
      }

      return {
        ws_id: payload.ws_id,
        success: true,
        ...result.data,
      };
    } catch (error) {
      console.error(
        `[${payload.ws_id}] Error in unified schedule task:`,
        error
      );

      return {
        ws_id: payload.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

/**
 * Scheduled trigger - runs every hour
 * Schedules all workspaces that have auto-schedule enabled items
 */
export const unifiedScheduleTrigger = schedules.task({
  id: 'unified-schedule',
  cron: {
    pattern: '0 * * * *', // Every hour on the hour
  },
  run: async () => {
    console.log('=== Starting unified schedule trigger ===');

    try {
      // Get workspaces that may need scheduling
      // Using the same function as calendar sync to get active workspaces
      const workspaces = await getWorkspacesForSync();

      console.log(
        `Found ${workspaces.length} workspaces for unified scheduling`
      );

      const results = [];

      for (const workspace of workspaces) {
        try {
          const handle = await unifiedScheduleTask.trigger(
            {
              ws_id: workspace.ws_id,
              windowDays: 30,
              forceReschedule: false, // Don't force reschedule on regular runs
            },
            {
              concurrencyKey: `unified-schedule-${workspace.ws_id}`,
            }
          );

          results.push({
            ws_id: workspace.ws_id,
            handle,
            status: 'triggered',
          });
        } catch (error) {
          console.error(
            `[${workspace.ws_id}] Error triggering unified schedule:`,
            error
          );
          results.push({
            ws_id: workspace.ws_id,
            error: error instanceof Error ? error.message : 'Unknown error',
            status: 'failed',
          });
        }
      }

      console.log('=== Unified schedule trigger completed ===');
      console.log(
        `Triggered: ${results.filter((r) => r.status === 'triggered').length}`
      );
      console.log(
        `Failed: ${results.filter((r) => r.status === 'failed').length}`
      );

      return {
        totalWorkspaces: workspaces.length,
        triggered: results.filter((r) => r.status === 'triggered').length,
        failed: results.filter((r) => r.status === 'failed').length,
        results,
      };
    } catch (error) {
      console.error('Error in unified schedule trigger:', error);
      throw error;
    }
  },
});

/**
 * Manual trigger task - can be called directly to schedule a specific workspace
 */
export const unifiedScheduleManualTrigger = task({
  id: 'unified-schedule-manual',
  run: async (payload: {
    ws_id: string;
    windowDays?: number;
    forceReschedule?: boolean;
  }) => {
    console.log(`[${payload.ws_id}] Manual unified schedule triggered`);

    const result = await unifiedScheduleHelper(payload.ws_id, {
      windowDays: payload.windowDays ?? 30,
      forceReschedule: payload.forceReschedule ?? true, // Force reschedule on manual trigger
    });

    return {
      ws_id: payload.ws_id,
      ...result,
    };
  },
});
