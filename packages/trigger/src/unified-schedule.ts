/**
 * Unified Scheduler Trigger.dev tasks
 *
 * The production Calendar schedule runs through apps/web cron. These task
 * wrappers remain for manual Trigger.dev runs and tests only.
 *
 * The unified scheduler ensures habits and tasks are scheduled in a coordinated manner:
 * - Habits are scheduled first (by priority)
 * - Tasks are scheduled second (by deadline + priority)
 * - Urgent tasks can bump lower-priority habit events
 */

import { task } from '@trigger.dev/sdk/v3';

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
