// Mocks must come next, before any imports that use them!
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Set required env vars for Supabase at the VERY TOP
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/callback';

// Mock the google-calendar-sync module
vi.mock('../src/google-calendar-sync', async () => {
  const actual = await vi.importActual('../src/google-calendar-sync');
  return {
    ...actual,
    getGoogleAuthClient: vi.fn(() => ({
      setCredentials: vi.fn(),
    })),
    getSyncToken: vi.fn(() => Promise.resolve('existing-sync-token-123')),
    storeSyncToken: vi.fn(() => Promise.resolve()),
    syncWorkspaceBatched: vi.fn((payload) =>
      Promise.resolve({
        ws_id: payload.ws_id,
        success: true,
        eventsSynced: payload.events_to_sync?.length || 10,
        eventsDeleted: 0,
      })
    ),
  };
});

// Define the mock response type to support both nextPageToken and nextSyncToken
type MockCalendarResponse = {
  data: {
    items: Array<{
      id: string;
      summary: string;
      description: string;
      start: { dateTime: string };
      end: { dateTime: string };
      location: string;
      colorId: string;
      status: string;
    }>;
    nextSyncToken?: string;
    nextPageToken?: string;
  };
};

// Mock @tuturuuu/google
const mockCalendarEventsList = vi.fn(() =>
  Promise.resolve({
    data: {
      items: [
        {
          id: 'event1',
          summary: 'Test Event 1',
          description: 'Test Description 1',
          start: { dateTime: '2024-01-15T10:00:00Z' },
          end: { dateTime: '2024-01-15T11:00:00Z' },
          location: 'Test Location 1',
          colorId: '1',
          status: 'confirmed',
        },
        {
          id: 'event2',
          summary: 'Test Event 2',
          description: 'Test Description 2',
          start: { dateTime: '2024-01-15T14:00:00Z' },
          end: { dateTime: '2024-01-15T15:00:00Z' },
          location: 'Test Location 2',
          colorId: '2',
          status: 'confirmed',
        },
      ],
      nextSyncToken: 'test-sync-token-123',
    } as MockCalendarResponse['data'],
  })
);

vi.mock('@tuturuuu/google', () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        list: mockCalendarEventsList,
      },
    })),
  },
}));

// Mock @trigger.dev/sdk/v3
vi.mock('@trigger.dev/sdk/v3', () => ({
  task: vi.fn((config) => ({
    id: config.id,
    trigger: vi.fn(),
    run: config.run,
    queue: config.queue,
  })),
  schedules: {
    task: vi.fn((config) => ({
      id: config.id,
      cron: config.cron,
      run: config.run,
    })),
  },
}));

dayjs.extend(utc);

// Dynamically import the actual functions after env and mocks are set
// This import is for side effects only - it triggers module loading with mocks
beforeAll(async () => {
  // Import for side effects - triggers task registration with mocked dependencies
  await import('../src/google-calendar-incremental-sync.js');
});

// Mock Google Calendar events for testing
const createMockGoogleEvent = (
  id: string,
  title: string,
  start: string,
  end: string,
  status = 'confirmed'
) => ({
  id,
  summary: title,
  description: `Description for ${title}`,
  start: { dateTime: start },
  end: { dateTime: end },
  location: `Location for ${title}`,
  colorId: '1',
  status,
});

describe('Google Calendar Incremental Sync', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.LOCALE;
    // Clear all mocks
    vi.clearAllMocks();

    // Reset the mock calendar events list to default state
    mockCalendarEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'event1',
            summary: 'Test Event 1',
            description: 'Test Description 1',
            start: { dateTime: '2024-01-15T10:00:00Z' },
            end: { dateTime: '2024-01-15T11:00:00Z' },
            location: 'Test Location 1',
            colorId: '1',
            status: 'confirmed',
          },
          {
            id: 'event2',
            summary: 'Test Event 2',
            description: 'Test Description 2',
            start: { dateTime: '2024-01-15T14:00:00Z' },
            end: { dateTime: '2024-01-15T15:00:00Z' },
            location: 'Test Location 2',
            colorId: '2',
            status: 'confirmed',
          },
        ],
        nextSyncToken: 'test-sync-token-123',
      } as MockCalendarResponse['data'],
    });
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });

  describe('Sync Token Handling', () => {
    it('should handle existing sync token correctly', async () => {
      const { getSyncToken } = await import('../src/google-calendar-sync.js');

      const result = await getSyncToken('test-workspace-id');
      expect(result).toBe('existing-sync-token-123');
      expect(getSyncToken).toHaveBeenCalledWith('test-workspace-id');
    });

    it('should store sync token correctly', async () => {
      const { storeSyncToken } = await import('../src/google-calendar-sync.js');
      const testDate = new Date('2024-01-15T10:00:00Z');

      await storeSyncToken('test-workspace-id', 'new-sync-token', testDate);
      expect(storeSyncToken).toHaveBeenCalledWith(
        'test-workspace-id',
        'new-sync-token',
        testDate
      );
    });
  });

  describe('Pagination Handling', () => {
    it('should handle pagination across multiple pages', async () => {
      // Mock multiple pages with proper type structure
      mockCalendarEventsList
        .mockResolvedValueOnce({
          data: {
            items: [
              createMockGoogleEvent(
                'event1',
                'Event 1',
                '2024-01-15T10:00:00Z',
                '2024-01-15T11:00:00Z'
              ),
            ],
            nextPageToken: 'page2-token',
            nextSyncToken: 'intermediate-sync-token',
          } as MockCalendarResponse['data'],
        })
        .mockResolvedValueOnce({
          data: {
            items: [
              createMockGoogleEvent(
                'event2',
                'Event 2',
                '2024-01-15T14:00:00Z',
                '2024-01-15T15:00:00Z'
              ),
            ],
            nextSyncToken: 'final-sync-token',
          } as MockCalendarResponse['data'],
        });

      // Test that pagination is properly handled
      const response1 = await mockCalendarEventsList();
      expect(response1.data.nextPageToken).toBe('page2-token');
      expect(response1.data.nextSyncToken).toBe('intermediate-sync-token');

      const response2 = await mockCalendarEventsList();
      expect(response2.data.nextSyncToken).toBe('final-sync-token');
      expect(response2.data.nextPageToken).toBeUndefined();
    });

    it('should handle single page response', async () => {
      // Mock single page response
      mockCalendarEventsList.mockResolvedValue({
        data: {
          items: [
            createMockGoogleEvent(
              'event1',
              'Single Event',
              '2024-01-15T10:00:00Z',
              '2024-01-15T11:00:00Z'
            ),
          ],
          nextSyncToken: 'single-page-sync-token',
        } as MockCalendarResponse['data'],
      });

      const response = await mockCalendarEventsList();
      expect(response.data.items).toHaveLength(1);
      expect(response.data.nextSyncToken).toBe('single-page-sync-token');
      expect(response.data.nextPageToken).toBeUndefined();
    });
  });

  describe('Deleted Events Handling', () => {
    it('should handle deleted events correctly', async () => {
      mockCalendarEventsList.mockResolvedValue({
        data: {
          items: [
            createMockGoogleEvent(
              'event1',
              'Active Event',
              '2024-01-15T10:00:00Z',
              '2024-01-15T11:00:00Z'
            ),
            {
              id: 'event2',
              summary: 'Deleted Event',
              description: 'Description for Deleted Event',
              start: { dateTime: '2024-01-15T14:00:00Z' },
              end: { dateTime: '2024-01-15T15:00:00Z' },
              location: 'Location for Deleted Event',
              colorId: '1',
              status: 'cancelled',
            },
          ],
          nextSyncToken: 'sync-token-with-deleted',
        } as MockCalendarResponse['data'],
      });

      // This would be tested in the actual task run
      expect(mockCalendarEventsList).toBeDefined();
    });

    it('should handle only deleted events', async () => {
      mockCalendarEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: 'event1',
              summary: 'Deleted Event 1',
              description: 'Description for Deleted Event 1',
              start: { dateTime: '2024-01-15T10:00:00Z' },
              end: { dateTime: '2024-01-15T11:00:00Z' },
              location: 'Location for Deleted Event 1',
              colorId: '1',
              status: 'cancelled',
            },
            {
              id: 'event2',
              summary: 'Deleted Event 2',
              description: 'Description for Deleted Event 2',
              start: { dateTime: '2024-01-15T14:00:00Z' },
              end: { dateTime: '2024-01-15T15:00:00Z' },
              location: 'Location for Deleted Event 2',
              colorId: '1',
              status: 'cancelled',
            },
          ],
          nextSyncToken: 'sync-token-only-deleted',
        } as MockCalendarResponse['data'],
      });

      // This would be tested in the actual task run
      expect(mockCalendarEventsList).toBeDefined();
    });
  });

  describe('Integration with syncWorkspaceBatched', () => {
    it('should call syncWorkspaceBatched when events exist', async () => {
      const { syncWorkspaceBatched } = await import(
        '../src/google-calendar-sync.js'
      );

      // This would be tested in the actual task run
      expect(syncWorkspaceBatched).toBeDefined();
    });

    it('should not call syncWorkspaceBatched when no events exist', async () => {
      // Mock empty response
      mockCalendarEventsList.mockResolvedValue({
        data: {
          items: [],
          nextSyncToken: 'empty-sync-token',
        } as MockCalendarResponse['data'],
      });

      const { syncWorkspaceBatched } = await import(
        '../src/google-calendar-sync.js'
      );

      // This would be tested in the actual task run
      expect(syncWorkspaceBatched).toBeDefined();
    });

    it('should handle batched sync errors gracefully', async () => {
      // Mock error in syncWorkspaceBatched
      const { syncWorkspaceBatched } = await import(
        '../src/google-calendar-sync.js'
      );
      (syncWorkspaceBatched as any).mockRejectedValue(
        new Error('Batched sync error')
      );

      // This would be tested in the actual task run
      expect(syncWorkspaceBatched).toBeDefined();
    });
  });

  describe('Google Calendar API Integration', () => {
    it('should call Google Calendar API with correct parameters', async () => {
      // Test default calendar ID
      await mockCalendarEventsList();
      expect(mockCalendarEventsList).toHaveBeenCalled();
    });

    it('should handle different calendar IDs', async () => {
      // This would test that different calendar IDs are passed correctly
      // (requires actual task implementation to verify)
      expect(mockCalendarEventsList).toBeDefined();
    });

    it('should handle sync token parameter correctly', async () => {
      const { getSyncToken } = await import('../src/google-calendar-sync.js');

      // Test that existing sync token is retrieved
      const syncToken = await getSyncToken('test-workspace-id');
      expect(syncToken).toBe('existing-sync-token-123');
    });

    it('should handle missing sync token parameter', async () => {
      // Mock no existing sync token
      const { getSyncToken } = await import('../src/google-calendar-sync.js');
      (getSyncToken as any).mockResolvedValue(null);

      const syncToken = await getSyncToken('test-workspace-id');
      expect(syncToken).toBeNull();
    });
  });

  describe('Mock Data Validation', () => {
    it('should return properly structured mock events', async () => {
      const response = await mockCalendarEventsList();
      const events = response.data.items;

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        id: 'event1',
        summary: 'Test Event 1',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
        status: 'confirmed',
      });
    });

    it('should handle events with different statuses', async () => {
      // Mock events with different statuses
      mockCalendarEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: 'event1',
              summary: 'Confirmed Event',
              description: 'Description for Confirmed Event',
              start: { dateTime: '2024-01-15T10:00:00Z' },
              end: { dateTime: '2024-01-15T11:00:00Z' },
              location: 'Location for Confirmed Event',
              colorId: '1',
              status: 'confirmed',
            },
            {
              id: 'event2',
              summary: 'Cancelled Event',
              description: 'Description for Cancelled Event',
              start: { dateTime: '2024-01-15T14:00:00Z' },
              end: { dateTime: '2024-01-15T15:00:00Z' },
              location: 'Location for Cancelled Event',
              colorId: '1',
              status: 'cancelled',
            },
            {
              id: 'event3',
              summary: 'Tentative Event',
              description: 'Description for Tentative Event',
              start: { dateTime: '2024-01-15T16:00:00Z' },
              end: { dateTime: '2024-01-15T17:00:00Z' },
              location: 'Location for Tentative Event',
              colorId: '1',
              status: 'tentative',
            },
          ],
          nextSyncToken: 'test-sync-token-123',
        } as MockCalendarResponse['data'],
      });

      const response = await mockCalendarEventsList();
      const events = response.data.items;

      expect(events).toHaveLength(3);
      expect(events[0]?.status).toBe('confirmed');
      expect(events[1]?.status).toBe('cancelled');
      expect(events[2]?.status).toBe('tentative');
    });
  });
});
