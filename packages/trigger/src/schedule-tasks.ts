import { task } from '@trigger.dev/sdk/v3';
import { schedulableTasksHelper } from './schedule-tasks-helper';

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
        ...result,
        success: true,
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
