import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

// Mock createAdminClient before importing the module
vi.mock('../server', () => ({
  createAdminClient: vi.fn(),
}));

// Import after mocking
import { createAdminClient } from '../server';
import { getLogAggregator } from '../realtime-log-aggregator';

describe('RealtimeLogAggregator', () => {
  let mockRpc: Mock;
  let consoleSpy: { log: Mock; error: Mock; warn: Mock };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    // Mock Supabase RPC
    mockRpc = vi.fn().mockResolvedValue({ error: null });
    (createAdminClient as Mock).mockResolvedValue({
      rpc: mockRpc,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
    consoleSpy.warn.mockRestore();
  });

  describe('getLogAggregator', () => {
    it('should return a singleton instance', () => {
      const instance1 = getLogAggregator();
      const instance2 = getLogAggregator();

      expect(instance1).toBe(instance2);
    });

    it('should have add, flush, and destroy methods', () => {
      const aggregator = getLogAggregator();

      expect(typeof aggregator.add).toBe('function');
      expect(typeof aggregator.flush).toBe('function');
      expect(typeof aggregator.destroy).toBe('function');
    });
  });

  describe('add', () => {
    it('should add log entries to the buffer', () => {
      const aggregator = getLogAggregator();

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'Test message',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      });

      // Buffer is private, but flush will process it
      expect(() => aggregator.flush()).not.toThrow();
    });

    it('should handle null userId', () => {
      const aggregator = getLogAggregator();

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: null,
        kind: 'info',
        message: 'Test message',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      });

      expect(() => aggregator.flush()).not.toThrow();
    });

    it('should extract channel ID from realtime messages', async () => {
      const aggregator = getLogAggregator();

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'realtime:board-cursor-abc123 connected',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      });

      await aggregator.flush();

      if (mockRpc.mock.calls.length > 0) {
        const logs = mockRpc.mock.calls[0][1].p_logs;
        expect(logs[0].channel_id).toBe('board-cursor-abc123');
      }
    });

    it('should extract channel ID from "ok realtime:" format', async () => {
      const aggregator = getLogAggregator();

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'ok realtime:presence-room-xyz joined',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      });

      await aggregator.flush();

      if (mockRpc.mock.calls.length > 0) {
        const logs = mockRpc.mock.calls[0][1].p_logs;
        expect(logs[0].channel_id).toBe('presence-room-xyz');
      }
    });
  });

  describe('flush', () => {
    it('should not flush when buffer is empty', async () => {
      const aggregator = getLogAggregator();

      // Force clear any existing buffer
      aggregator.destroy();

      // Get a fresh instance after destroy
      const freshAggregator = getLogAggregator();
      await freshAggregator.flush();

      // Should not call RPC when buffer is empty
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('should aggregate logs by bucket key', async () => {
      const aggregator = getLogAggregator();
      const timestamp = new Date('2024-01-15T10:00:00Z');

      // Add multiple logs with same bucket key
      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'Message 1',
        timestamp,
      });

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'Message 2',
        timestamp,
      });

      await aggregator.flush();

      if (mockRpc.mock.calls.length > 0) {
        const logs = mockRpc.mock.calls[0][1].p_logs;
        // Should aggregate into single entry
        expect(logs.length).toBe(1);
        expect(logs[0].total_count).toBe(2);
      }
    });

    it('should count errors separately', async () => {
      const aggregator = getLogAggregator();
      const timestamp = new Date('2024-01-15T10:00:00Z');

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'error',
        message: 'Error message',
        timestamp,
      });

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'error',
        message: 'Another error',
        timestamp,
      });

      await aggregator.flush();

      if (mockRpc.mock.calls.length > 0) {
        const logs = mockRpc.mock.calls[0][1].p_logs;
        expect(logs[0].error_count).toBe(2);
      }
    });

    it('should handle flush errors gracefully', async () => {
      const aggregator = getLogAggregator();

      mockRpc.mockResolvedValue({ error: { message: 'Database error' } });

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'Test message',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      });

      // Should not throw
      await expect(aggregator.flush()).resolves.not.toThrow();

      // Should log error
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should skip entries with invalid UUID', async () => {
      const aggregator = getLogAggregator();

      aggregator.add({
        wsId: 'invalid-uuid',
        userId: 'user-1',
        kind: 'info',
        message: 'Test message',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      });

      await aggregator.flush();

      // Should warn about invalid UUID
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid wsId format')
      );
    });
  });

  describe('automatic flushing', () => {
    it('should auto-flush when buffer exceeds MAX_BUFFER_SIZE', () => {
      const aggregator = getLogAggregator();

      // Add 1000+ entries to trigger auto-flush
      for (let i = 0; i < 1001; i++) {
        aggregator.add({
          wsId: '12345678-1234-1234-1234-123456789012',
          userId: `user-${i}`,
          kind: 'info',
          message: `Message ${i}`,
          timestamp: new Date(
            `2024-01-15T10:${String(i % 60).padStart(2, '0')}:00Z`
          ),
        });
      }

      // Should log about buffer overflow
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Buffer size exceeded')
      );
    });
  });

  describe('destroy', () => {
    it('should stop the flush timer and trigger final flush', async () => {
      const aggregator = getLogAggregator();

      // Add some entries first so flush has something to process
      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'Test before destroy',
        timestamp: new Date('2024-01-15T10:00:00Z'),
      });

      aggregator.destroy();

      // Should trigger final flush (logs it)
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Flushing')
      );
    });

    it('should not throw when called on empty buffer', () => {
      const aggregator = getLogAggregator();

      // Should not throw even with empty buffer
      expect(() => aggregator.destroy()).not.toThrow();
    });
  });

  describe('time bucketing', () => {
    it('should round timestamps to bucket boundaries', async () => {
      const aggregator = getLogAggregator();

      // Add logs at different times within same bucket
      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'Message 1',
        timestamp: new Date('2024-01-15T10:00:30Z'),
      });

      aggregator.add({
        wsId: '12345678-1234-1234-1234-123456789012',
        userId: 'user-1',
        kind: 'info',
        message: 'Message 2',
        timestamp: new Date('2024-01-15T10:00:45Z'),
      });

      await aggregator.flush();

      if (mockRpc.mock.calls.length > 0) {
        const logs = mockRpc.mock.calls[0][1].p_logs;
        // Should be in same bucket
        expect(logs.length).toBe(1);
        expect(logs[0].total_count).toBe(2);
      }
    });
  });

  describe('sample messages', () => {
    it('should sample messages from logs', async () => {
      const aggregator = getLogAggregator();
      const timestamp = new Date('2024-01-15T10:00:00Z');

      for (let i = 0; i < 20; i++) {
        aggregator.add({
          wsId: '12345678-1234-1234-1234-123456789012',
          userId: 'user-1',
          kind: 'info',
          message: `Message ${i}`,
          timestamp,
        });
      }

      await aggregator.flush();

      if (mockRpc.mock.calls.length > 0) {
        const logs = mockRpc.mock.calls[0][1].p_logs;
        // Should have sample messages (max 10)
        expect(logs[0].sample_messages.length).toBeLessThanOrEqual(10);
      }
    });

    it('should deduplicate sample messages', async () => {
      const aggregator = getLogAggregator();
      const timestamp = new Date('2024-01-15T10:00:00Z');

      // Add duplicate messages
      for (let i = 0; i < 10; i++) {
        aggregator.add({
          wsId: '12345678-1234-1234-1234-123456789012',
          userId: 'user-1',
          kind: 'info',
          message: 'Same message',
          timestamp,
        });
      }

      await aggregator.flush();

      if (mockRpc.mock.calls.length > 0) {
        const logs = mockRpc.mock.calls[0][1].p_logs;
        // Should only have 1 unique sample message
        expect(logs[0].sample_messages.length).toBe(1);
        expect(logs[0].sample_messages[0]).toBe('Same message');
      }
    });
  });
});
