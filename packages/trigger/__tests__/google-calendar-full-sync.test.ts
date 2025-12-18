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
  const actual = await vi.importActual('../src/google-calendar-sync.js');
  return {
    ...actual,
    getGoogleAuthClient: vi.fn(() => ({
      setCredentials: vi.fn(),
      request: vi.fn(() => Promise.resolve({ data: {} })),
    })),
    syncWorkspaceBatched: vi.fn((payload) =>
      Promise.resolve({
        ws_id: payload.ws_id,
        success: true,
        eventsSynced: payload.events_to_sync?.length || 10,
        eventsDeleted: 0,
      })
    ),
    storeSyncToken: vi.fn(() => Promise.resolve()),
  };
});

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
    },
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

dayjs.extend(utc);

// Dynamically import the actual function after env and mocks are set
let performFullSyncForWorkspace: any;

beforeAll(async () => {
  const mod = await import('../src/google-calendar-full-sync.js');
  performFullSyncForWorkspace = mod.performFullSyncForWorkspace;
});

describe('performFullSyncForWorkspace', () => {
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
      },
    });
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should perform full sync for a workspace with default calendar ID', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = 'test-refresh-token';

      const events = await performFullSyncForWorkspace(
        'primary',
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('event1');
      expect(events[1].id).toBe('event2');
    });

    it('should perform full sync for a workspace with custom calendar ID', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = 'test-refresh-token';
      const calendarId = 'custom-calendar-id';

      const events = await performFullSyncForWorkspace(
        calendarId,
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
    });

    it('should handle empty events list', async () => {
      // Mock empty response
      mockCalendarEventsList.mockResolvedValue({
        data: {
          items: [],
          nextSyncToken: 'empty-sync-token',
        },
      });

      const events = await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(0);
    });
  });

  describe('Token Handling', () => {
    it('should handle missing refresh token', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = '';

      const events = await performFullSyncForWorkspace(
        'primary',
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
    });

    it('should handle null refresh token', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = null as any;

      const events = await performFullSyncForWorkspace(
        'primary',
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
    });

    it('should handle undefined refresh token', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = undefined as any;

      const events = await performFullSyncForWorkspace(
        'primary',
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
    });
  });

  describe('Integration with syncWorkspaceBatched', () => {
    it('should call syncWorkspaceBatched when events exist', async () => {
      const { syncWorkspaceBatched } = await import(
        '../src/google-calendar-sync.js'
      );

      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(syncWorkspaceBatched).toHaveBeenCalledWith({
        ws_id: 'test-workspace',
        events_to_sync: expect.arrayContaining([
          expect.objectContaining({ id: 'event1' }),
          expect.objectContaining({ id: 'event2' }),
        ]),
      });
    });

    it('should not call syncWorkspaceBatched when no events exist', async () => {
      // Mock empty response
      mockCalendarEventsList.mockResolvedValue({
        data: {
          items: [],
          nextSyncToken: 'empty-sync-token',
        },
      });

      const { syncWorkspaceBatched } = await import(
        '../src/google-calendar-sync.js'
      );

      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(syncWorkspaceBatched).not.toHaveBeenCalled();
    });
  });

  describe('Sync Token Handling', () => {
    it('should store sync token when available', async () => {
      const { storeSyncToken } = await import('../src/google-calendar-sync.js');

      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(storeSyncToken).toHaveBeenCalledWith(
        'test-workspace',
        'test-sync-token-123',
        expect.any(Date),
        'primary'
      );
    });

    it('should handle missing sync token gracefully', async () => {
      // Mock response without sync token
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
          ],
        } as any,
      });

      const { storeSyncToken } = await import('../src/google-calendar-sync.js');

      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(storeSyncToken).not.toHaveBeenCalled();
    });
  });

  describe('Google Calendar API Integration', () => {
    it('should handle Google Calendar API parameters correctly', async () => {
      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(mockCalendarEventsList).toHaveBeenCalledWith({
        calendarId: 'primary',
        showDeleted: true,
        singleEvents: true,
        maxResults: 2500,
        timeMin: expect.any(String),
        timeMax: expect.any(String),
      });
    });

    it('should handle different calendar IDs', async () => {
      const calendarIds = ['primary', 'custom-calendar-id', 'another-calendar'];

      for (const calendarId of calendarIds) {
        await performFullSyncForWorkspace(
          calendarId,
          'test-workspace',
          'test-access-token',
          'test-refresh-token'
        );

        expect(mockCalendarEventsList).toHaveBeenCalledWith(
          expect.objectContaining({
            calendarId: calendarId,
          })
        );
      }
    });

    it('should handle time range calculations correctly', async () => {
      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(mockCalendarEventsList).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: expect.any(String),
          timeMax: expect.any(String),
        })
      );

      // Verify the time range is approximately 270 days
      const calls = mockCalendarEventsList.mock.calls as any[];
      expect(calls.length).toBeGreaterThan(0);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      if (callArgs) {
        const timeMin = dayjs(callArgs.timeMin);
        const timeMax = dayjs(callArgs.timeMax);
        const dayDifference = timeMax.diff(timeMin, 'day');

        expect(dayDifference).toBe(270);
      }
    });
  });

  describe('Mock Data Validation', () => {
    it('should return properly structured mock events', async () => {
      const events = await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(events).toHaveLength(2);

      // Check first event structure
      expect(events[0]).toMatchObject({
        id: 'event1',
        summary: 'Test Event 1',
        description: 'Test Description 1',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
        location: 'Test Location 1',
        colorId: '1',
        status: 'confirmed',
      });

      // Check second event structure
      expect(events[1]).toMatchObject({
        id: 'event2',
        summary: 'Test Event 2',
        description: 'Test Description 2',
        start: { dateTime: '2024-01-15T14:00:00Z' },
        end: { dateTime: '2024-01-15T15:00:00Z' },
        location: 'Test Location 2',
        colorId: '2',
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
              description: 'Confirmed Event Description',
              start: { dateTime: '2024-01-15T10:00:00Z' },
              end: { dateTime: '2024-01-15T11:00:00Z' },
              location: 'Confirmed Event Location',
              colorId: '1',
              status: 'confirmed',
            },
            {
              id: 'event2',
              summary: 'Cancelled Event',
              description: 'Cancelled Event Description',
              start: { dateTime: '2024-01-15T14:00:00Z' },
              end: { dateTime: '2024-01-15T15:00:00Z' },
              location: 'Cancelled Event Location',
              colorId: '2',
              status: 'cancelled',
            },
            {
              id: 'event3',
              summary: 'Tentative Event',
              description: 'Tentative Event Description',
              start: { dateTime: '2024-01-15T16:00:00Z' },
              end: { dateTime: '2024-01-15T17:00:00Z' },
              location: 'Tentative Event Location',
              colorId: '3',
              status: 'tentative',
            },
          ],
          nextSyncToken: 'test-sync-token-123',
        },
      });

      const events = await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(events).toHaveLength(3);
      expect(events[0]?.status).toBe('confirmed');
      expect(events[1]?.status).toBe('cancelled');
      expect(events[2]?.status).toBe('tentative');
    });
  });
});
