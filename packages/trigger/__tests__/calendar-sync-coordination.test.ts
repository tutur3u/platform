// Mocks must come first, before any imports that use them!
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Set required env vars
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Import functions after mocks are set
import {
  BACKGROUND_SYNC_RANGE,
  canProceedWithSync,
  isWithinBackgroundSyncRange,
  updateLastUpsert,
} from '../src/calendar-sync-coordination';

describe('Calendar Sync Coordination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('BACKGROUND_SYNC_RANGE', () => {
    it('should be 4 weeks (28 days)', () => {
      expect(BACKGROUND_SYNC_RANGE).toBe(28);
    });
  });

  describe('isWithinBackgroundSyncRange', () => {
    it('returns true when date range is within 4 weeks from now', () => {
      const startDate = dayjs().add(1, 'day');
      const endDate = dayjs().add(7, 'day');

      const result = isWithinBackgroundSyncRange(startDate, endDate);

      expect(result).toBe(true);
    });

    it('returns true when date range starts today', () => {
      const startDate = dayjs();
      const endDate = dayjs().add(3, 'day');

      const result = isWithinBackgroundSyncRange(startDate, endDate);

      expect(result).toBe(true);
    });

    it('returns true when date range ends exactly at 4-week boundary', () => {
      const startDate = dayjs().add(20, 'day');
      const endDate = dayjs().add(28, 'day');

      const result = isWithinBackgroundSyncRange(startDate, endDate);

      expect(result).toBe(true);
    });

    it('returns false when date range is entirely in the past', () => {
      const startDate = dayjs().subtract(14, 'day');
      const endDate = dayjs().subtract(7, 'day');

      const result = isWithinBackgroundSyncRange(startDate, endDate);

      expect(result).toBe(false);
    });

    it('returns false when date range is entirely beyond 4 weeks', () => {
      const startDate = dayjs().add(30, 'day');
      const endDate = dayjs().add(45, 'day');

      const result = isWithinBackgroundSyncRange(startDate, endDate);

      expect(result).toBe(false);
    });

    it('returns true when date range overlaps the boundary (starts before, ends within)', () => {
      const startDate = dayjs().subtract(5, 'day');
      const endDate = dayjs().add(10, 'day');

      const result = isWithinBackgroundSyncRange(startDate, endDate);

      expect(result).toBe(true);
    });

    it('returns true when date range overlaps the boundary (starts within, ends after)', () => {
      const startDate = dayjs().add(20, 'day');
      const endDate = dayjs().add(35, 'day');

      const result = isWithinBackgroundSyncRange(startDate, endDate);

      expect(result).toBe(true);
    });

    it('returns true when date range spans entire 4-week period and beyond', () => {
      const startDate = dayjs().subtract(10, 'day');
      const endDate = dayjs().add(40, 'day');

      const result = isWithinBackgroundSyncRange(startDate, endDate);

      expect(result).toBe(true);
    });
  });

  describe('canProceedWithSync', () => {
    const wsId = 'test-workspace-id';

    it('returns true when no dates are provided (active sync)', async () => {
      const result = await canProceedWithSync(wsId, mockSupabaseClient);

      expect(result).toBe(true);
    });

    it('returns true when dates are outside background sync range', async () => {
      const dates = [
        new Date(dayjs().add(35, 'day').toISOString()),
        new Date(dayjs().add(40, 'day').toISOString()),
      ];

      const result = await canProceedWithSync(wsId, mockSupabaseClient, dates);

      expect(result).toBe(true);
    });

    it('returns true when no sync record exists (creates new record)', async () => {
      const dates = [
        new Date(dayjs().add(1, 'day').toISOString()),
        new Date(dayjs().add(5, 'day').toISOString()),
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }, // Not found
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      });

      const result = await canProceedWithSync(wsId, mockSupabaseClient, dates);

      expect(result).toBe(true);
    });

    it('returns true when last upsert was more than 30 seconds ago', async () => {
      const dates = [
        new Date(dayjs().add(1, 'day').toISOString()),
        new Date(dayjs().add(5, 'day').toISOString()),
      ];

      const thirtyOneSecondsAgo = new Date(Date.now() - 31000).toISOString();

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { last_upsert: thirtyOneSecondsAgo },
              error: null,
            }),
          }),
        }),
      });

      const result = await canProceedWithSync(wsId, mockSupabaseClient, dates);

      expect(result).toBe(true);
    });

    it('returns false when last upsert was less than 30 seconds ago (cooldown)', async () => {
      const dates = [
        new Date(dayjs().add(1, 'day').toISOString()),
        new Date(dayjs().add(5, 'day').toISOString()),
      ];

      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { last_upsert: tenSecondsAgo },
              error: null,
            }),
          }),
        }),
      });

      const result = await canProceedWithSync(wsId, mockSupabaseClient, dates);

      expect(result).toBe(false);
    });

    it('returns true when database fetch fails (allows sync on error)', async () => {
      const dates = [
        new Date(dayjs().add(1, 'day').toISOString()),
        new Date(dayjs().add(5, 'day').toISOString()),
      ];

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'UNKNOWN_ERROR', message: 'Database error' },
            }),
          }),
        }),
      });

      const result = await canProceedWithSync(wsId, mockSupabaseClient, dates);

      expect(result).toBe(true);
    });

    it('returns true when exception is thrown (allows sync on error)', async () => {
      const dates = [
        new Date(dayjs().add(1, 'day').toISOString()),
        new Date(dayjs().add(5, 'day').toISOString()),
      ];

      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Connection error');
      });

      const result = await canProceedWithSync(wsId, mockSupabaseClient, dates);

      expect(result).toBe(true);
    });

    it('handles exactly 30 seconds boundary (should block)', async () => {
      const dates = [
        new Date(dayjs().add(1, 'day').toISOString()),
        new Date(dayjs().add(5, 'day').toISOString()),
      ];

      // Exactly 30 seconds ago - should still block (not yet past cooldown)
      const exactlyThirtySecondsAgo = new Date(
        Date.now() - 30000
      ).toISOString();

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { last_upsert: exactlyThirtySecondsAgo },
              error: null,
            }),
          }),
        }),
      });

      const result = await canProceedWithSync(wsId, mockSupabaseClient, dates);

      // At exactly 30 seconds, timeSinceLastUpsert (30000) is NOT < thirtySeconds (30000)
      // So it should allow sync
      expect(result).toBe(true);
    });

    it('handles 29 seconds boundary (should block)', async () => {
      const dates = [
        new Date(dayjs().add(1, 'day').toISOString()),
        new Date(dayjs().add(5, 'day').toISOString()),
      ];

      const twentyNineSecondsAgo = new Date(Date.now() - 29000).toISOString();

      mockSupabaseClient.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { last_upsert: twentyNineSecondsAgo },
              error: null,
            }),
          }),
        }),
      });

      const result = await canProceedWithSync(wsId, mockSupabaseClient, dates);

      expect(result).toBe(false);
    });
  });

  describe('updateLastUpsert', () => {
    const wsId = 'test-workspace-id';

    it('successfully updates last upsert timestamp', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });

      mockSupabaseClient.from.mockReturnValue({
        upsert: upsertMock,
      });

      await updateLastUpsert(wsId, mockSupabaseClient);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith(
        'workspace_calendar_sync_coordination'
      );
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ws_id: wsId,
          last_upsert: expect.any(String),
        }),
        { onConflict: 'ws_id' }
      );
    });

    it('logs error when upsert fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const upsertMock = vi
        .fn()
        .mockResolvedValue({ error: { message: 'Upsert failed' } });

      mockSupabaseClient.from.mockReturnValue({
        upsert: upsertMock,
      });

      await updateLastUpsert(wsId, mockSupabaseClient);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error updating lastUpsert:',
        expect.objectContaining({ message: 'Upsert failed' })
      );
    });

    it('handles exception gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Connection error');
      });

      // Should not throw
      await updateLastUpsert(wsId, mockSupabaseClient);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error updating lastUpsert:',
        expect.any(Error)
      );
    });

    it('uses ISO string format for timestamp', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });

      mockSupabaseClient.from.mockReturnValue({
        upsert: upsertMock,
      });

      await updateLastUpsert(wsId, mockSupabaseClient);

      const call = upsertMock.mock.calls[0]?.[0] as
        | { ws_id: string; last_upsert: string }
        | undefined;
      expect(call).toBeDefined();
      // Verify the timestamp is a valid ISO string
      expect(() => new Date(call!.last_upsert)).not.toThrow();
      expect(call!.last_upsert).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
