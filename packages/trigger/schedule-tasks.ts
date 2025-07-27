import { getWorkspacesForSync } from './google-calendar-sync';
import { schedulableTasksHelper } from './schedule-tasks-helper';
import { schedules, task } from '@trigger.dev/sdk/v3';

export const scheduleTasksTrigger = schedules.task({
  id: 'schedule-tasks',
  cron: {
    pattern: '* * * * *',
  },
  run: async () => {
    console.log('=== Starting schedule tasks trigger ===');

    try {
      // You'll need to specify the workspace ID here
      // This could come from environment variables or configuration
      const workspaces = await getWorkspacesForSync();

      console.log(
        `Found ${workspaces.length} workspaces to sync incrementally`
      );

      let result = { success: true, error: null };

      for (const workspace of workspaces) {
        const ws_id = workspace.ws_id;
        console.log(`Processing workspace: ${ws_id}`);
        result = await schedulableTasksHelper(ws_id);

        if (!result.success) {
          throw new Error(result.error || 'Schedule tasks failed');
        }
      }

      console.log('=== Schedule tasks completed ===');
      return result;
    } catch (error) {
      console.error('Error in schedule tasks trigger:', error);
      throw error;
    }
  },
});
