import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

// Mock the aggregator module
vi.mock('../realtime-log-aggregator', () => ({
  getLogAggregator: vi.fn(),
}));

import { addRealtimeLog, flushRealtimeLogs } from '../realtime-log-actions';
import { getLogAggregator } from '../realtime-log-aggregator';

describe('Realtime Log Actions', () => {
  let mockAggregator: {
    add: Mock;
    flush: Mock;
  };
  let consoleSpy: { error: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAggregator = {
      add: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    (getLogAggregator as Mock).mockReturnValue(mockAggregator);

    consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.error.mockRestore();
  });

  describe('addRealtimeLog', () => {
    it('should add a log entry with all required fields', async () => {
      await addRealtimeLog('ws-123', 'user-456', 'info', 'Test message');

      expect(getLogAggregator).toHaveBeenCalled();
      expect(mockAggregator.add).toHaveBeenCalledWith(
        expect.objectContaining({
          wsId: 'ws-123',
          userId: 'user-456',
          kind: 'info',
          message: 'Test message',
          timestamp: expect.any(Date),
        })
      );
    });

    it('should add a log entry with optional data', async () => {
      const customData = { key: 'value', count: 42 };

      await addRealtimeLog(
        'ws-123',
        'user-456',
        'debug',
        'Debug message',
        customData
      );

      expect(mockAggregator.add).toHaveBeenCalledWith(
        expect.objectContaining({
          wsId: 'ws-123',
          userId: 'user-456',
          kind: 'debug',
          message: 'Debug message',
          data: customData,
        })
      );
    });

    it('should handle null userId', async () => {
      await addRealtimeLog('ws-123', null, 'info', 'Anonymous log');

      expect(mockAggregator.add).toHaveBeenCalledWith(
        expect.objectContaining({
          wsId: 'ws-123',
          userId: null,
          kind: 'info',
          message: 'Anonymous log',
        })
      );
    });

    it('should not throw when aggregator.add fails', async () => {
      mockAggregator.add.mockImplementation(() => {
        throw new Error('Buffer full');
      });

      // Should not throw
      await expect(
        addRealtimeLog('ws-123', 'user-456', 'error', 'Error message')
      ).resolves.not.toThrow();

      // Should log the error
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[RealtimeLogAggregator] Failed to add log:',
        expect.any(Error)
      );
    });

    it('should include current timestamp', async () => {
      const beforeTime = new Date();

      await addRealtimeLog('ws-123', 'user-456', 'info', 'Test');

      const afterTime = new Date();

      const addCall = mockAggregator.add.mock.calls[0][0];
      expect(addCall.timestamp.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime()
      );
      expect(addCall.timestamp.getTime()).toBeLessThanOrEqual(
        afterTime.getTime()
      );
    });

    it('should handle different log kinds', async () => {
      const kinds = ['info', 'warn', 'error', 'debug', 'trace'];

      for (const kind of kinds) {
        await addRealtimeLog('ws-123', 'user-456', kind, `${kind} message`);
      }

      expect(mockAggregator.add).toHaveBeenCalledTimes(kinds.length);
    });
  });

  describe('flushRealtimeLogs', () => {
    it('should call aggregator.flush', async () => {
      await flushRealtimeLogs();

      expect(getLogAggregator).toHaveBeenCalled();
      expect(mockAggregator.flush).toHaveBeenCalled();
    });

    it('should await flush completion', async () => {
      let flushCompleted = false;
      mockAggregator.flush.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        flushCompleted = true;
      });

      await flushRealtimeLogs();

      expect(flushCompleted).toBe(true);
    });

    it('should propagate flush errors', async () => {
      mockAggregator.flush.mockRejectedValue(new Error('Flush failed'));

      await expect(flushRealtimeLogs()).rejects.toThrow('Flush failed');
    });
  });
});
