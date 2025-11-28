// Set required env vars before any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
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

vi.mock('../src/unified-schedule-helper', () => ({
  unifiedScheduleHelper: vi.fn(),
}));

// Import after mock setup
import { task, schedules } from '@trigger.dev/sdk/v3';
import { getWorkspacesForSync } from '../src/google-calendar-sync';
import { unifiedScheduleHelper } from '../src/unified-schedule-helper';

// Import module to trigger task registration
import {
  unifiedScheduleTask,
  unifiedScheduleTrigger,
  unifiedScheduleManualTrigger,
} from '../src/unified-schedule';

describe('Unified Schedule', () => {
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

  describe('unifiedScheduleTask', () => {
    it('should return success when helper succeeds', async () => {
      const mockResult = {
        success: true,
        data: {
          summary: { habitsScheduled: 5, tasksScheduled: 10 },
        },
      };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-task'];
      const result = await runFn({
        ws_id: 'test-ws-id',
        windowDays: 14,
        forceReschedule: true,
      });

      expect(unifiedScheduleHelper).toHaveBeenCalledWith('test-ws-id', {
        windowDays: 14,
        forceReschedule: true,
      });
      expect(result.success).toBe(true);
      expect(result.ws_id).toBe('test-ws-id');
    });

    it('should return error when helper returns failure', async () => {
      const mockResult = { success: false, error: 'Schedule error' };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-task'];
      const result = await runFn({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Schedule error');
    });

    it('should handle exceptions gracefully', async () => {
      (unifiedScheduleHelper as Mock).mockRejectedValue(new Error('API error'));

      const runFn = taskRunFunctions['unified-schedule-task'];
      const result = await runFn({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      (unifiedScheduleHelper as Mock).mockRejectedValue({ code: 'ERROR' });

      const runFn = taskRunFunctions['unified-schedule-task'];
      const result = await runFn({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should handle undefined options', async () => {
      const mockResult = { success: true, data: { summary: {} } };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-task'];
      await runFn({ ws_id: 'test-ws-id' });

      expect(unifiedScheduleHelper).toHaveBeenCalledWith('test-ws-id', {
        windowDays: undefined,
        forceReschedule: undefined,
      });
    });
  });

  describe('unifiedScheduleTrigger', () => {
    it('should trigger tasks for all workspaces', async () => {
      const mockWorkspaces = [{ ws_id: 'ws-1' }, { ws_id: 'ws-2' }];
      (getWorkspacesForSync as Mock).mockResolvedValue(mockWorkspaces);

      const mockTrigger = vi.fn().mockResolvedValue({ id: 'handle-id' });
      unifiedScheduleTask.trigger = mockTrigger;

      const runFn = scheduledTaskRunFunctions['unified-schedule'];
      const result = await runFn();

      expect(getWorkspacesForSync).toHaveBeenCalled();
      expect(mockTrigger).toHaveBeenCalledTimes(2);
      expect(result.totalWorkspaces).toBe(2);
      expect(result.triggered).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should pass correct options to trigger', async () => {
      const mockWorkspaces = [{ ws_id: 'test-ws' }];
      (getWorkspacesForSync as Mock).mockResolvedValue(mockWorkspaces);

      const mockTrigger = vi.fn().mockResolvedValue({ id: 'handle-id' });
      unifiedScheduleTask.trigger = mockTrigger;

      const runFn = scheduledTaskRunFunctions['unified-schedule'];
      await runFn();

      expect(mockTrigger).toHaveBeenCalledWith(
        {
          ws_id: 'test-ws',
          windowDays: 30,
          forceReschedule: false,
        },
        { concurrencyKey: 'unified-schedule-test-ws' }
      );
    });

    it('should handle empty workspace list', async () => {
      (getWorkspacesForSync as Mock).mockResolvedValue([]);

      const runFn = scheduledTaskRunFunctions['unified-schedule'];
      const result = await runFn();

      expect(result.totalWorkspaces).toBe(0);
      expect(result.triggered).toBe(0);
      expect(result.results.length).toBe(0);
    });

    it('should handle individual trigger failures', async () => {
      const mockWorkspaces = [{ ws_id: 'ws-1' }, { ws_id: 'ws-2' }];
      (getWorkspacesForSync as Mock).mockResolvedValue(mockWorkspaces);

      const mockTrigger = vi
        .fn()
        .mockResolvedValueOnce({ id: 'handle-1' })
        .mockRejectedValueOnce(new Error('Trigger failed'));

      unifiedScheduleTask.trigger = mockTrigger;

      const runFn = scheduledTaskRunFunctions['unified-schedule'];
      const result = await runFn();

      expect(result.totalWorkspaces).toBe(2);
      expect(result.triggered).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should throw when getWorkspacesForSync fails', async () => {
      (getWorkspacesForSync as Mock).mockRejectedValue(new Error('DB error'));

      const runFn = scheduledTaskRunFunctions['unified-schedule'];

      await expect(runFn()).rejects.toThrow('DB error');
    });
  });

  describe('unifiedScheduleManualTrigger', () => {
    it('should call helper with provided options', async () => {
      const mockResult = {
        success: true,
        data: { summary: { habitsScheduled: 3 } },
      };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-manual'];
      const result = await runFn({
        ws_id: 'test-ws',
        windowDays: 7,
        forceReschedule: false,
      });

      expect(unifiedScheduleHelper).toHaveBeenCalledWith('test-ws', {
        windowDays: 7,
        forceReschedule: false,
      });
      expect(result.ws_id).toBe('test-ws');
    });

    it('should use default values when options not provided', async () => {
      const mockResult = { success: true, data: {} };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-manual'];
      await runFn({ ws_id: 'test-ws' });

      expect(unifiedScheduleHelper).toHaveBeenCalledWith('test-ws', {
        windowDays: 30,
        forceReschedule: true, // Manual triggers force reschedule by default
      });
    });

    it('should log manual trigger invocation', async () => {
      const mockResult = { success: true, data: {} };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-manual'];
      await runFn({ ws_id: 'test-ws' });

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[test-ws] Manual unified schedule triggered'
      );
    });
  });
});
