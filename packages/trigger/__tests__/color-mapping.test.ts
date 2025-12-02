// Set required env vars before any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase admin client
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn(),
    })
  ),
}));

// Mock Supabase client (used in calendar-sync-coordination)
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
  })),
}));

// Mock calendar utils
vi.mock('@tuturuuu/utils/calendar-utils', () => ({
  convertGoogleAllDayEvent: vi.fn(
    (startDate: string, endDate: string, _mode: string) => ({
      start_at: startDate || '2024-01-15T10:00:00Z',
      end_at: endDate || '2024-01-15T11:00:00Z',
    })
  ),
}));

// Import after mock setup
import { formatEventForDb } from '../src/google-calendar-sync';

describe('Color Mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Google Calendar Color ID Mapping via formatEventForDb', () => {
    const wsId = 'test-workspace';
    const baseEvent = {
      id: 'event-123',
      summary: 'Test Event',
      description: 'Test Description',
      location: 'Test Location',
      start: { dateTime: '2024-01-15T10:00:00Z' },
      end: { dateTime: '2024-01-15T11:00:00Z' },
    };

    it('maps colorId "1" to RED', () => {
      const event = { ...baseEvent, colorId: '1' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('RED');
    });

    it('maps colorId "2" to GREEN', () => {
      const event = { ...baseEvent, colorId: '2' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('GREEN');
    });

    it('maps colorId "3" to GRAY', () => {
      const event = { ...baseEvent, colorId: '3' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('GRAY');
    });

    it('maps colorId "4" to PINK', () => {
      const event = { ...baseEvent, colorId: '4' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('PINK');
    });

    it('maps colorId "5" to YELLOW', () => {
      const event = { ...baseEvent, colorId: '5' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('YELLOW');
    });

    it('maps colorId "6" to ORANGE', () => {
      const event = { ...baseEvent, colorId: '6' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('ORANGE');
    });

    it('maps colorId "8" to CYAN', () => {
      const event = { ...baseEvent, colorId: '8' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('CYAN');
    });

    it('maps colorId "9" to PURPLE', () => {
      const event = { ...baseEvent, colorId: '9' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('PURPLE');
    });

    it('maps colorId "10" to INDIGO', () => {
      const event = { ...baseEvent, colorId: '10' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('INDIGO');
    });

    it('maps colorId "11" to BLUE', () => {
      const event = { ...baseEvent, colorId: '11' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('BLUE');
    });

    it('defaults to BLUE for undefined colorId', () => {
      const event = { ...baseEvent };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('BLUE');
    });

    it('defaults to BLUE for null colorId', () => {
      const event = { ...baseEvent, colorId: null } as typeof baseEvent & {
        colorId: string | null;
      };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('BLUE');
    });

    it('defaults to BLUE for invalid colorId "7"', () => {
      const event = { ...baseEvent, colorId: '7' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('BLUE');
    });

    it('defaults to BLUE for invalid colorId "12"', () => {
      const event = { ...baseEvent, colorId: '12' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('BLUE');
    });

    it('defaults to BLUE for invalid colorId "0"', () => {
      const event = { ...baseEvent, colorId: '0' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('BLUE');
    });

    it('defaults to BLUE for non-numeric colorId', () => {
      const event = { ...baseEvent, colorId: 'banana' };
      const result = formatEventForDb(event, wsId);
      expect(result.color).toBe('BLUE');
    });
  });

  describe('formatEventForDb', () => {
    const wsId = 'test-workspace';

    it('formats event with all fields', () => {
      const event = {
        id: 'event-123',
        summary: 'Meeting',
        description: 'Team sync',
        location: 'Room 101',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
        colorId: '1',
      };

      const result = formatEventForDb(event, wsId);

      expect(result.google_event_id).toBe('event-123');
      expect(result.google_calendar_id).toBe('primary');
      expect(result.title).toBe('Meeting');
      expect(result.description).toBe('Team sync');
      expect(result.location).toBe('Room 101');
      expect(result.ws_id).toBe(wsId);
      expect(result.locked).toBe(true);
    });

    it('uses custom google_calendar_id when provided', () => {
      const event = {
        id: 'event-123',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
      };

      const result = formatEventForDb(event, wsId, 'custom-calendar-id');

      expect(result.google_calendar_id).toBe('custom-calendar-id');
    });

    it('defaults to "primary" when google_calendar_id is not provided', () => {
      const event = {
        id: 'event-123',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
      };

      const result = formatEventForDb(event, wsId);

      expect(result.google_calendar_id).toBe('primary');
    });

    it('defaults title to "Untitled Event" when summary is empty', () => {
      const event = {
        id: 'event-123',
        summary: '',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
      };

      const result = formatEventForDb(event, wsId);

      expect(result.title).toBe('Untitled Event');
    });

    it('defaults title to "Untitled Event" when summary is undefined', () => {
      const event = {
        id: 'event-123',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
      };

      const result = formatEventForDb(event, wsId);

      expect(result.title).toBe('Untitled Event');
    });

    it('defaults description to empty string when undefined', () => {
      const event = {
        id: 'event-123',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
      };

      const result = formatEventForDb(event, wsId);

      expect(result.description).toBe('');
    });

    it('defaults location to empty string when undefined', () => {
      const event = {
        id: 'event-123',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
      };

      const result = formatEventForDb(event, wsId);

      expect(result.location).toBe('');
    });

    it('handles all-day events with date format', () => {
      const event = {
        id: 'event-123',
        start: { date: '2024-01-15' },
        end: { date: '2024-01-16' },
      };

      const result = formatEventForDb(event, wsId);

      expect(result.google_event_id).toBe('event-123');
      // The mock handles the date conversion
      expect(result.start_at).toBeDefined();
      expect(result.end_at).toBeDefined();
    });

    it('prefers dateTime over date when both present', () => {
      const event = {
        id: 'event-123',
        start: { dateTime: '2024-01-15T10:00:00Z', date: '2024-01-15' },
        end: { dateTime: '2024-01-15T11:00:00Z', date: '2024-01-16' },
      };

      const result = formatEventForDb(event, wsId);

      expect(result.start_at).toBe('2024-01-15T10:00:00Z');
      expect(result.end_at).toBe('2024-01-15T11:00:00Z');
    });

    it('handles empty start object', () => {
      const event = {
        id: 'event-123',
        start: {},
        end: { dateTime: '2024-01-15T11:00:00Z' },
      };

      const result = formatEventForDb(event, wsId);

      // Should handle gracefully with default values from mock
      expect(result.google_event_id).toBe('event-123');
    });

    it('handles missing start object', () => {
      const event = {
        id: 'event-123',
        end: { dateTime: '2024-01-15T11:00:00Z' },
      } as {
        id: string;
        end: { dateTime: string };
        start?: { dateTime?: string; date?: string };
      };

      const result = formatEventForDb(event, wsId);

      expect(result.google_event_id).toBe('event-123');
    });

    it('always sets locked to true', () => {
      const event = {
        id: 'event-123',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' },
      };

      const result = formatEventForDb(event, wsId);

      expect(result.locked).toBe(true);
    });
  });
});
