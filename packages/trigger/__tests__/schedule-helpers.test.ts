// Set required env vars before any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the fetch function
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mock setup
import { schedulableTasksHelper } from '../src/schedule-tasks-helper';
import { unifiedScheduleHelper } from '../src/unified-schedule-helper';

describe('Schedule Helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('schedulableTasksHelper', () => {
    const wsId = 'test-workspace-id';

    it('returns success when API call succeeds', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';
      process.env.NODE_ENV = 'development';

      const mockData = { scheduled: true, tasksCount: 5 };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await schedulableTasksHelper(wsId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeUndefined();
    });

    it('calls correct localhost URL in development', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';
      process.env.NODE_ENV = 'development';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await schedulableTasksHelper(wsId);

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:7803/api/${wsId}/calendar/auto-schedule?stream=false`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-trigger-secret-key': 'test-secret-key',
          },
        })
      );
    });

    it('calls correct production URL in production', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';
      process.env.NODE_ENV = 'production';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await schedulableTasksHelper(wsId);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://tuturuuu.com/api/${wsId}/calendar/auto-schedule?stream=false`,
        expect.any(Object)
      );
    });

    it('returns error when secret key is missing', async () => {
      delete process.env.INTERNAL_TRIGGER_SECRET_KEY;

      const result = await schedulableTasksHelper(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INTERNAL_TRIGGER_SECRET_KEY is not set');
    });

    it('returns error when HTTP response is not ok', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await schedulableTasksHelper(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP error! status: 500');
    });

    it('returns error when fetch throws', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await schedulableTasksHelper(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('handles non-Error exceptions', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockRejectedValue('String error');

      const result = await schedulableTasksHelper(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('includes correct headers in request', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'my-secret';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await schedulableTasksHelper(wsId);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'x-internal-trigger-secret-key': 'my-secret',
          },
        })
      );
    });
  });

  describe('unifiedScheduleHelper', () => {
    const wsId = 'test-workspace-id';

    it('returns success with summary data when API call succeeds', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';
      process.env.NODE_ENV = 'development';

      const mockResponse = {
        summary: {
          habitsScheduled: 5,
          tasksScheduled: 10,
          eventsCreated: 15,
          bumpedHabits: 2,
          rescheduledHabits: 1,
          windowDays: 30,
        },
        warnings: ['Some warning'],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await unifiedScheduleHelper(wsId);

      expect(result.success).toBe(true);
      expect(result.data?.summary).toEqual(mockResponse.summary);
      expect(result.data?.warnings).toEqual(['Some warning']);
    });

    it('calls correct localhost URL in development', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';
      process.env.NODE_ENV = 'development';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: {}, warnings: [] }),
      });

      await unifiedScheduleHelper(wsId);

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:7803/api/v1/workspaces/${wsId}/calendar/schedule`,
        expect.any(Object)
      );
    });

    it('calls correct production URL in production', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';
      process.env.NODE_ENV = 'production';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: {}, warnings: [] }),
      });

      await unifiedScheduleHelper(wsId);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://tuturuuu.com/api/v1/workspaces/${wsId}/calendar/schedule`,
        expect.any(Object)
      );
    });

    it('returns error when secret key is missing', async () => {
      delete process.env.INTERNAL_TRIGGER_SECRET_KEY;

      const result = await unifiedScheduleHelper(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INTERNAL_TRIGGER_SECRET_KEY is not set');
    });

    it('sends default options when none provided', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: {}, warnings: [] }),
      });

      await unifiedScheduleHelper(wsId);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            windowDays: 30,
            forceReschedule: false,
          }),
        })
      );
    });

    it('sends custom options when provided', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: {}, warnings: [] }),
      });

      await unifiedScheduleHelper(wsId, {
        windowDays: 14,
        forceReschedule: true,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            windowDays: 14,
            forceReschedule: true,
          }),
        })
      );
    });

    it('returns error with HTTP status and body when response not ok', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      const result = await unifiedScheduleHelper(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP error 400: Bad request');
    });

    it('returns error when fetch throws', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await unifiedScheduleHelper(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('handles non-Error exceptions', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockRejectedValue({ code: 'ECONNREFUSED' });

      const result = await unifiedScheduleHelper(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('includes correct headers in request', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'unified-secret';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: {}, warnings: [] }),
      });

      await unifiedScheduleHelper(wsId);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'x-internal-trigger-secret-key': 'unified-secret',
          },
        })
      );
    });

    it('handles partial options (only windowDays)', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: {}, warnings: [] }),
      });

      await unifiedScheduleHelper(wsId, { windowDays: 7 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            windowDays: 7,
            forceReschedule: false,
          }),
        })
      );
    });

    it('handles partial options (only forceReschedule)', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ summary: {}, warnings: [] }),
      });

      await unifiedScheduleHelper(wsId, { forceReschedule: true });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            windowDays: 30,
            forceReschedule: true,
          }),
        })
      );
    });

    it('handles empty warnings array', async () => {
      process.env.INTERNAL_TRIGGER_SECRET_KEY = 'test-secret-key';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            summary: {
              habitsScheduled: 0,
              tasksScheduled: 0,
              eventsCreated: 0,
              bumpedHabits: 0,
              rescheduledHabits: 0,
              windowDays: 30,
            },
            warnings: [],
          }),
      });

      const result = await unifiedScheduleHelper(wsId);

      expect(result.success).toBe(true);
      expect(result.data?.warnings).toEqual([]);
    });
  });
});
