import {
  canProceedWithSync,
  isWithin4WeeksFromCurrentWeek,
  updateLastUpsert,
} from './calendar-sync-coordination';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Calendar Sync Coordination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canProceedWithSync', () => {
    it('should allow sync for new workspace (no existing record)', async () => {
      // Mock Supabase client for new workspace scenario
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            })),
          })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        })),
      };

      const result = await canProceedWithSync(
        'test-ws-id',
        mockSupabase as any
      );

      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith(
        'workspace_calendar_sync_coordination'
      );
    });

    it('should block sync if less than 30 seconds have passed', async () => {
      const thirtySecondsAgo = new Date(Date.now() - 15 * 1000); // 15 seconds ago

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { last_upsert: thirtySecondsAgo.toISOString() },
                error: null,
              }),
            })),
          })),
        })),
      };

      const result = await canProceedWithSync(
        'test-ws-id',
        mockSupabase as any
      );

      expect(result).toBe(false);
    });

    it('should allow sync if more than 30 seconds have passed', async () => {
      const fortySecondsAgo = new Date(Date.now() - 40 * 1000); // 40 seconds ago

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { last_upsert: fortySecondsAgo.toISOString() },
                error: null,
              }),
            })),
          })),
        })),
      };

      const result = await canProceedWithSync(
        'test-ws-id',
        mockSupabase as any
      );

      expect(result).toBe(true);
    });

    it('should allow sync on database error (graceful degradation)', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'OTHER_ERROR' },
              }),
            })),
          })),
        })),
      };

      const result = await canProceedWithSync(
        'test-ws-id',
        mockSupabase as any
      );

      expect(result).toBe(true);
    });
  });

  describe('isWithin4WeeksFromCurrentWeek', () => {
    it('should return true for date range within current week', () => {
      const now = dayjs();
      const startDate = now.startOf('week').toDate();
      const endDate = now.endOf('week').toDate();

      const result = isWithin4WeeksFromCurrentWeek(startDate, endDate);

      expect(result).toBe(true);
    });

    it('should return true for date range within 4 weeks from current week', () => {
      const now = dayjs();
      const startDate = now.startOf('week').toDate();
      const endDate = now.startOf('week').add(3, 'week').endOf('week').toDate();

      const result = isWithin4WeeksFromCurrentWeek(startDate, endDate);

      expect(result).toBe(true);
    });

    it('should return true for date range overlapping with 4-week window', () => {
      const now = dayjs();
      const startDate = now.subtract(1, 'week').toDate();
      const endDate = now.add(2, 'week').toDate();

      const result = isWithin4WeeksFromCurrentWeek(startDate, endDate);

      expect(result).toBe(true);
    });

    it('should return false for date range too far in the past', () => {
      const now = dayjs();
      const startDate = now.subtract(6, 'week').toDate();
      const endDate = now.subtract(5, 'week').toDate();

      const result = isWithin4WeeksFromCurrentWeek(startDate, endDate);

      expect(result).toBe(false);
    });

    it('should return false for date range too far in the future', () => {
      const now = dayjs();
      const startDate = now.add(5, 'week').toDate();
      const endDate = now.add(6, 'week').toDate();

      const result = isWithin4WeeksFromCurrentWeek(startDate, endDate);

      expect(result).toBe(false);
    });

    it('should return false for date range completely outside 4-week window', () => {
      const now = dayjs();
      const startDate = now.subtract(10, 'week').toDate();
      const endDate = now.subtract(9, 'week').toDate();

      const result = isWithin4WeeksFromCurrentWeek(startDate, endDate);

      expect(result).toBe(false);
    });
  });

  describe('updateLastUpsert', () => {
    it('should update lastUpsert timestamp successfully', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          upsert: vi.fn().mockResolvedValue({ error: null }),
        })),
      };

      await updateLastUpsert('test-ws-id', mockSupabase as any);

      expect(mockSupabase.from).toHaveBeenCalledWith(
        'workspace_calendar_sync_coordination'
      );
      expect(mockSupabase.from().upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          ws_id: 'test-ws-id',
          last_upsert: expect.any(String),
        }),
        { onConflict: 'ws_id' }
      );
    });

    it('should handle upsert errors gracefully', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          upsert: vi.fn().mockResolvedValue({
            error: { message: 'Database error' },
          }),
        })),
      };

      // Should not throw
      await expect(
        updateLastUpsert('test-ws-id', mockSupabase as any)
      ).resolves.not.toThrow();
    });
  });
});
