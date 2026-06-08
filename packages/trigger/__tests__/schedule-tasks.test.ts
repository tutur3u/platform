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
const { taskRunFunctions, schedulesTaskMock } = vi.hoisted(() => ({
  taskRunFunctions: {} as Record<string, (...args: unknown[]) => unknown>,
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

vi.mock('../src/schedule-tasks-helper', () => ({
  schedulableTasksHelper: vi.fn(),
}));

// Import module to trigger task registration (variables may appear unused)
import '../src/schedule-tasks';
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
    it('does not register a Trigger.dev scheduled cron task', () => {
      expect(schedulesTaskMock).not.toHaveBeenCalled();
    });

    it('should return success when helper succeeds', async () => {
      const mockResult = { success: true, data: { scheduled: 5 } };
      (schedulableTasksHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['schedule-task'];
      const result = (await runFn!({ ws_id: 'test-ws-id' })) as {
        success: boolean;
        ws_id: string;
      };

      expect(schedulableTasksHelper).toHaveBeenCalledWith('test-ws-id');
      expect(result.success).toBe(true);
      expect(result.ws_id).toBe('test-ws-id');
    });

    it('should return error when helper returns failure', async () => {
      const mockResult = { success: false, error: 'API error' };
      (schedulableTasksHelper as Mock).mockResolvedValue(mockResult);

      const runFn = taskRunFunctions['schedule-task'];
      const result = (await runFn!({ ws_id: 'test-ws-id' })) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('should handle exceptions gracefully', async () => {
      (schedulableTasksHelper as Mock).mockRejectedValue(
        new Error('Network error')
      );

      const runFn = taskRunFunctions['schedule-task'];
      const result = (await runFn!({ ws_id: 'test-ws-id' })) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      (schedulableTasksHelper as Mock).mockRejectedValue('String error');

      const runFn = taskRunFunctions['schedule-task'];
      const result = (await runFn!({ ws_id: 'test-ws-id' })) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });
});
