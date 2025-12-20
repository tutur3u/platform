// Set required env vars before any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

// Use vi.hoisted to properly hoist the storage variables
const { taskRunFunctions, scheduledTaskRunFunctions } = vi.hoisted(() => ({
  taskRunFunctions: {} as Record<string, Function>,
  scheduledTaskRunFunctions: {} as Record<string, Function>,
}));

// Mock dependencies
vi.mock('@trigger.dev/sdk/v3', () => ({
  task: vi.fn((config) => {
    taskRunFunctions[config.id] = config.run;
    return {
      ...config,
      trigger: vi.fn(),
    };
  }),
  schedules: {
    task: vi.fn((config) => {
      scheduledTaskRunFunctions[config.id] = config.run;
      return {
        ...config,
        trigger: vi.fn(),
      };
    }),
  },
}));

vi.mock('../src/google-calendar-sync', () => ({
  getWorkspacesForSync: vi.fn(),
}));

vi.mock('../src/schedule-tasks-helper', () => ({
  schedulableTasksHelper: vi.fn(),
}));

// Import after mock setup - some imports are only used to trigger side effects
// @ts-expect-error - imported for mock setup
import { schedules, task } from '@trigger.dev/sdk/v3';
import { getWorkspacesForSync } from '../src/google-calendar-sync';
// Import module to trigger task registration (variables may appear unused)
import {
  scheduleTasksTrigger as _scheduleTasksTrigger,
  scheduleTask,
} from '../src/schedule-tasks';
import { schedulableTasksHelper } from '../src/schedule-tasks-helper';

describe('Schedule Tasks', () => {
  let consoleSpy: { log: Mock; error: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('scheduleTask', () => {
    it('should return success when helper succeeds', async () => {
      const mockResult = { success: true, data: { scheduled: 5 } };
      (schedulableTasksHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['schedule-task'];
      const result = await runFn!({ ws_id: 'test-ws-id' });

      expect(schedulableTasksHelper).toHaveBeenCalledWith('test-ws-id');
      expect(result.success).toBe(true);
      expect(result.ws_id).toBe('test-ws-id');
    });

    it('should return error when helper returns failure', async () => {
      const mockResult = { success: false, error: 'API error' };
      (schedulableTasksHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['schedule-task'];
      const result = await runFn!({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('should handle exceptions gracefully', async () => {
      (schedulableTasksHelper as Mock).mockRejectedValue(
        new Error('Network error')
      );

      const runFn = taskRunFunctions['schedule-task'];
      const result = await runFn!({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      (schedulableTasksHelper as Mock).mockRejectedValue('String error');

      const runFn = taskRunFunctions['schedule-task'];
      const result = await runFn!({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('scheduleTasksTrigger', () => {
    it('should trigger tasks for all workspaces', async () => {
      const mockWorkspaces = [
        { ws_id: 'ws-1' },
        { ws_id: 'ws-2' },
        { ws_id: 'ws-3' },
      ];
      (getWorkspacesForSync as Mock).mockResolvedValue(mockWorkspaces);

      const mockTrigger = vi.fn().mockResolvedValue({ id: 'handle-id' });
      scheduleTask.trigger = mockTrigger;

      const runFn = scheduledTaskRunFunctions['schedule-tasks'];
      const results = await runFn!();

      expect(getWorkspacesForSync).toHaveBeenCalled();
      expect(mockTrigger).toHaveBeenCalledTimes(3);
      expect(results.length).toBe(3);
    });

    it('should handle empty workspace list', async () => {
      (getWorkspacesForSync as Mock).mockResolvedValue([]);

      const runFn = scheduledTaskRunFunctions['schedule-tasks'];
      const results = await runFn!();

      expect(results.length).toBe(0);
    });

    it('should handle individual trigger failures', async () => {
      const mockWorkspaces = [{ ws_id: 'ws-1' }, { ws_id: 'ws-2' }];
      (getWorkspacesForSync as Mock).mockResolvedValue(mockWorkspaces);

      const mockTrigger = vi
        .fn()
        .mockResolvedValueOnce({ id: 'handle-1' })
        .mockRejectedValueOnce(new Error('Trigger failed'));

      scheduleTask.trigger = mockTrigger;

      const runFn = scheduledTaskRunFunctions['schedule-tasks'];
      const results = await runFn!();

      expect(results.length).toBe(2);
      expect(results[0].status).toBe('triggered');
      expect(results[1].status).toBe('failed');
      expect(results[1].error).toBe('Trigger failed');
    });

    it('should throw when getWorkspacesForSync fails', async () => {
      (getWorkspacesForSync as Mock).mockRejectedValue(new Error('DB error'));

      const runFn = scheduledTaskRunFunctions['schedule-tasks'];

      await expect(runFn!()).rejects.toThrow('DB error');
    });

    it('should pass concurrency key to trigger', async () => {
      const mockWorkspaces = [{ ws_id: 'test-ws' }];
      (getWorkspacesForSync as Mock).mockResolvedValue(mockWorkspaces);

      const mockTrigger = vi.fn().mockResolvedValue({ id: 'handle-id' });
      scheduleTask.trigger = mockTrigger;

      const runFn = scheduledTaskRunFunctions['schedule-tasks'];
      await runFn!();

      expect(mockTrigger).toHaveBeenCalledWith(
        { ws_id: 'test-ws' },
        { concurrencyKey: 'calendar-auto-schedule-test-ws' }
      );
    });
  });
});
