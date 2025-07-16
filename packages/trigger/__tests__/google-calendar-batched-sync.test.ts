// Set required env vars for Supabase at the VERY TOP
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'dummy-service-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-role-key';
process.env.GOOGLE_CLIENT_ID = 'dummy-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'dummy-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/callback';

// Mocks must come next, before any imports that use them!
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => ({
    upsert: vi.fn(() => Promise.resolve({ error: null as any })),
    delete: vi.fn(() => ({
      or: vi.fn(() => Promise.resolve({ error: null as any }))
    }))
  }))
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => mockSupabaseClient)
}));

// Mock the calendar sync coordination utility
vi.mock('@tuturuuu/utils/calendar-sync-coordination', () => ({
  updateLastUpsert: vi.fn(() => Promise.resolve())
}));

// Mock the calendar utils
vi.mock('@tuturuuu/ui/hooks/calendar-utils', () => ({
  convertGoogleAllDayEvent: vi.fn((start, end, timezone) => ({
    start_at: start,
    end_at: end
  }))
}));

// Dynamically import the actual functions after env and mocks are set
let syncGoogleCalendarEventsForWorkspaceBatched: any;
let syncWorkspaceBatched: any;

beforeAll(async () => {
  const mod = await import('../google-calendar-sync');
  syncGoogleCalendarEventsForWorkspaceBatched = mod.syncGoogleCalendarEventsForWorkspaceBatched;
  syncWorkspaceBatched = mod.syncWorkspaceBatched;
});

// Test isolation utility to prevent environment contamination
const isolateTest = (testFn: () => void | Promise<void>) => {
  return async () => {
    const originalEnv = { ...process.env };
    try {
      await testFn();
    } finally {
      process.env = originalEnv;
    }
  };
};

// Mock Google Calendar events for testing
const createMockGoogleEvent = (id: string, title: string, start: string, end: string, status = 'confirmed') => ({
  id,
  summary: title,
  description: `Description for ${title}`,
  start: { dateTime: start },
  end: { dateTime: end },
  location: `Location for ${title}`,
  colorId: '1',
  status
});

describe('Google Calendar Batched Sync', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.LOCALE;
    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset Supabase client mocks
    mockSupabaseClient.from.mockReturnValue({
      upsert: vi.fn(() => Promise.resolve({ error: null as any })),
      delete: vi.fn(() => ({
        or: vi.fn(() => Promise.resolve({ error: null as any }))
      }))
    });
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });

  describe('syncGoogleCalendarEventsForWorkspaceBatched', () => {
    it('should process events in batches for upserts', async () => {
      const ws_id = 'test-workspace';
      const events = [
        createMockGoogleEvent('event1', 'Test Event 1', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z'),
        createMockGoogleEvent('event2', 'Test Event 2', '2024-01-15T14:00:00Z', '2024-01-15T15:00:00Z'),
        createMockGoogleEvent('event3', 'Test Event 3', '2024-01-15T16:00:00Z', '2024-01-15T17:00:00Z'),
      ];

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 3,
        eventsDeleted: 0,
      });

      // Verify upsert was called
      const upsertMock = mockSupabaseClient.from().upsert;
      expect(upsertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            google_event_id: 'event1',
            title: 'Test Event 1',
            ws_id: 'test-workspace'
          }),
          expect.objectContaining({
            google_event_id: 'event2',
            title: 'Test Event 2',
            ws_id: 'test-workspace'
          }),
          expect.objectContaining({
            google_event_id: 'event3',
            title: 'Test Event 3',
            ws_id: 'test-workspace'
          })
        ]),
        {
          onConflict: 'ws_id,google_event_id',
          ignoreDuplicates: true,
        }
      );
    });

    it('should process events in batches for deletes', async () => {
      const ws_id = 'test-workspace';
      const events = [
        createMockGoogleEvent('event1', 'Cancelled Event 1', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z', 'cancelled'),
        createMockGoogleEvent('event2', 'Cancelled Event 2', '2024-01-15T14:00:00Z', '2024-01-15T15:00:00Z', 'cancelled'),
        createMockGoogleEvent('event3', 'Cancelled Event 3', '2024-01-15T16:00:00Z', '2024-01-15T17:00:00Z', 'cancelled'),
      ];

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 0,
        eventsDeleted: 3,
      });

      // Verify delete was called
      const deleteMock = mockSupabaseClient.from().delete;
      expect(deleteMock).toHaveBeenCalled();
    });

    it('should handle mixed events (confirmed and cancelled)', async () => {
      const ws_id = 'test-workspace';
      const events = [
        createMockGoogleEvent('event1', 'Confirmed Event', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z', 'confirmed'),
        createMockGoogleEvent('event2', 'Cancelled Event', '2024-01-15T14:00:00Z', '2024-01-15T15:00:00Z', 'cancelled'),
        createMockGoogleEvent('event3', 'Another Confirmed Event', '2024-01-15T16:00:00Z', '2024-01-15T17:00:00Z', 'confirmed'),
      ];

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 2,
        eventsDeleted: 1,
      });
    });

    it('should handle empty events array', async () => {
      const ws_id = 'test-workspace';
      const events: any[] = [];

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 0,
        eventsDeleted: 0,
      });
    });

    it('should handle upsert errors gracefully', async () => {
      const ws_id = 'test-workspace';
      const events = [
        createMockGoogleEvent('event1', 'Test Event 1', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z'),
      ];

      // Mock upsert error
      mockSupabaseClient.from.mockReturnValue({
        upsert: vi.fn(() => Promise.resolve({ error: new Error('Upsert failed') })),
        delete: vi.fn(() => ({
          or: vi.fn(() => Promise.resolve({ error: null as any }))
        }))
      });

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: false,
        error: 'Upsert failed',
      });
    });

    it('should handle delete errors gracefully', async () => {
      const ws_id = 'test-workspace';
      const events = [
        createMockGoogleEvent('event1', 'Cancelled Event', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z', 'cancelled'),
      ];

      // Mock delete error
      mockSupabaseClient.from.mockReturnValue({
        upsert: vi.fn(() => Promise.resolve({ error: null as any })),
        delete: vi.fn(() => ({
          or: vi.fn(() => Promise.resolve({ error: new Error('Delete failed') }))
        }))
      });

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: false,
        error: 'Delete failed',
      });
    });

    it('should process large batches correctly', async () => {
      const ws_id = 'test-workspace';
      const events: any[] = [];
      
      // Create 150 events (more than BATCH_SIZE of 100)
      for (let i = 1; i <= 150; i++) {
        events.push(createMockGoogleEvent(`event${i}`, `Test Event ${i}`, '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z'));
      }

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 150,
        eventsDeleted: 0,
      });

      // Verify upsert was called multiple times for batching
      const upsertMock = mockSupabaseClient.from().upsert;
      expect(upsertMock).toHaveBeenCalledTimes(2); // 150 events / 100 batch size = 2 calls
    });

    it('should process large delete batches correctly', async () => {
      const ws_id = 'test-workspace';
      const events: any[] = [];
      
      // Create 75 cancelled events (more than DELETE_BATCH_SIZE of 50)
      for (let i = 1; i <= 75; i++) {
        events.push(createMockGoogleEvent(`event${i}`, `Cancelled Event ${i}`, '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z', 'cancelled'));
      }

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 0,
        eventsDeleted: 75,
      });

      // Verify delete was called multiple times for batching
      const deleteMock = mockSupabaseClient.from().delete;
      expect(deleteMock).toHaveBeenCalledTimes(2); // 75 events / 50 batch size = 2 calls
    });
  });

  describe('syncWorkspaceBatched', () => {
    it('should call the batched sync function with correct payload', async () => {
      const payload = {
        ws_id: 'test-workspace',
        events_to_sync: [
          createMockGoogleEvent('event1', 'Test Event 1', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z'),
          createMockGoogleEvent('event2', 'Test Event 2', '2024-01-15T14:00:00Z', '2024-01-15T15:00:00Z'),
        ]
      };

      const result = await syncWorkspaceBatched(payload);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 2,
        eventsDeleted: 0,
      });
    });

    it('should handle empty events array', async () => {
      const payload = {
        ws_id: 'test-workspace',
        events_to_sync: []
      };

      const result = await syncWorkspaceBatched(payload);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 0,
        eventsDeleted: 0,
      });
    });

    it('should propagate errors from the batched sync function', async () => {
      const payload = {
        ws_id: 'test-workspace',
        events_to_sync: [
          createMockGoogleEvent('event1', 'Test Event 1', '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z'),
        ]
      };

      // Mock error in the underlying function
      mockSupabaseClient.from.mockReturnValue({
        upsert: vi.fn(() => Promise.resolve({ error: new Error('Database error') })),
        delete: vi.fn(() => ({
          or: vi.fn(() => Promise.resolve({ error: null as any }))
        }))
      });

      const result = await syncWorkspaceBatched(payload);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: false,
        error: 'Database error',
      });
    });
  });

  describe('Batch Configuration', () => {
    it('should use correct batch sizes for different operations', async () => {
      const ws_id = 'test-workspace';
      const events: any[] = [];
      
      // Create events that will test both upsert and delete batching
      for (let i = 1; i <= 120; i++) {
        if (i <= 60) {
          events.push(createMockGoogleEvent(`event${i}`, `Confirmed Event ${i}`, '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z', 'confirmed'));
        } else {
          events.push(createMockGoogleEvent(`event${i}`, `Cancelled Event ${i}`, '2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z', 'cancelled'));
        }
      }

      const result = await syncGoogleCalendarEventsForWorkspaceBatched(ws_id, events);

      expect(result).toEqual({
        ws_id: 'test-workspace',
        success: true,
        eventsSynced: 60,
        eventsDeleted: 60,
      });

      // Verify upsert was called twice (60 events / 100 batch size = 1 call, but we have 60 events)
      const upsertMock = mockSupabaseClient.from().upsert;
      expect(upsertMock).toHaveBeenCalledTimes(1);

      // Verify delete was called twice (60 events / 50 batch size = 2 calls)
      const deleteMock = mockSupabaseClient.from().delete;
      expect(deleteMock).toHaveBeenCalledTimes(2);
    });
  });
}); 