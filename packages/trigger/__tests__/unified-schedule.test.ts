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
type TaskRunFn = (...args: any[]) => any;
const { taskRunFunctions, schedulesTaskMock } = vi.hoisted(() => ({
  taskRunFunctions: {} as Record<string, TaskRunFn>,
  schedulesTaskMock: vi.fn(),
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
    task: schedulesTaskMock,
  },
}));

vi.mock('../src/unified-schedule-helper', () => ({
  unifiedScheduleHelper: vi.fn(),
}));

// Import module to trigger task registration (some variables may appear unused)
import '../src/unified-schedule';
import { unifiedScheduleHelper } from '../src/unified-schedule-helper';

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
    it('does not register a Trigger.dev scheduled cron task', () => {
      expect(schedulesTaskMock).not.toHaveBeenCalled();
    });

    it('should return success when helper succeeds', async () => {
      const mockResult = {
        success: true,
        data: {
          summary: { habitsScheduled: 5, tasksScheduled: 10 },
        },
      };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-task'];
      const result = await runFn!({
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
      const result = await runFn!({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Schedule error');
    });

    it('should handle exceptions gracefully', async () => {
      (unifiedScheduleHelper as Mock).mockRejectedValue(new Error('API error'));

      const runFn = taskRunFunctions['unified-schedule-task'];
      const result = await runFn!({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      (unifiedScheduleHelper as Mock).mockRejectedValue({ code: 'ERROR' });

      const runFn = taskRunFunctions['unified-schedule-task'];
      const result = await runFn!({ ws_id: 'test-ws-id' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should handle undefined options', async () => {
      const mockResult = { success: true, data: { summary: {} } };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-task'];
      await runFn!({ ws_id: 'test-ws-id' });

      expect(unifiedScheduleHelper).toHaveBeenCalledWith('test-ws-id', {
        windowDays: undefined,
        forceReschedule: undefined,
      });
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
      const result = await runFn!({
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
      await runFn!({ ws_id: 'test-ws' });

      expect(unifiedScheduleHelper).toHaveBeenCalledWith('test-ws', {
        windowDays: 30,
        forceReschedule: true, // Manual triggers force reschedule by default
      });
    });

    it('should log manual trigger invocation', async () => {
      const mockResult = { success: true, data: {} };
      (unifiedScheduleHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['unified-schedule-manual'];
      await runFn!({ ws_id: 'test-ws' });

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[test-ws] Manual unified schedule triggered'
      );
    });
  });
});
