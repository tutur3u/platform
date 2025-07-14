import { describe, it, expect } from 'vitest';
import { isAllDayEvent, convertGoogleAllDayEvent, createAllDayEvent } from './calendar-utils';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

describe('calendar-utils', () => {
  describe('isAllDayEvent', () => {
    it('should detect all-day events with date-only format', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T00:00:00.000Z',
        end_at: '2024-01-02T00:00:00.000Z'
      };
      
      expect(isAllDayEvent(event)).toBe(true);
    });

    it('should detect all-day events spanning multiple days', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T00:00:00.000Z',
        end_at: '2024-01-03T00:00:00.000Z' // 48 hours
      };
      
      expect(isAllDayEvent(event)).toBe(true);
    });

    it('should detect single-day all-day events', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T00:00:00.000Z',
        end_at: '2024-01-01T00:00:00.000Z' // Same day
      };
      
      expect(isAllDayEvent(event)).toBe(true);
    });

    it('should reject timed events', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T10:00:00.000Z',
        end_at: '2024-01-01T11:00:00.000Z'
      };
      
      expect(isAllDayEvent(event)).toBe(false);
    });

    it('should reject events not starting at midnight', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T01:00:00.000Z',
        end_at: '2024-01-02T00:00:00.000Z'
      };
      
      expect(isAllDayEvent(event)).toBe(false);
    });

    it('should reject events not ending at midnight', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T00:00:00.000Z',
        end_at: '2024-01-02T01:00:00.000Z'
      };
      
      expect(isAllDayEvent(event)).toBe(false);
    });

    it('should reject events with non-24-hour duration', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T00:00:00.000Z',
        end_at: '2024-01-01T12:00:00.000Z' // 12 hours
      };
      
      expect(isAllDayEvent(event)).toBe(false);
    });

    it('should reject events with 0 duration', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T00:00:00.000Z',
        end_at: '2024-01-01T00:00:00.000Z' // Same time
      };
      
      expect(isAllDayEvent(event)).toBe(false);
    });

    it('should handle events with seconds and milliseconds', () => {
      const event: Pick<CalendarEvent, 'start_at' | 'end_at'> = {
        start_at: '2024-01-01T00:00:00.123Z',
        end_at: '2024-01-02T00:00:00.456Z'
      };
      
      expect(isAllDayEvent(event)).toBe(false);
    });
  });

  describe('convertGoogleAllDayEvent', () => {
    it('should convert Google date-only format to user timezone midnight', () => {
      const result = convertGoogleAllDayEvent('2024-01-01', '2024-01-02', 'America/New_York');
      
      // Should convert to timezone midnight
      expect(result.start_at).toMatch(/2024-01-01T05:00:00\.000Z/); // UTC equivalent of midnight EST
      expect(result.end_at).toMatch(/2024-01-02T05:00:00\.000Z/);
    });

    it('should handle missing dates by using current time', () => {
      const result = convertGoogleAllDayEvent(undefined, undefined, 'America/New_York');
      
      expect(result.start_at).toBeDefined();
      expect(result.end_at).toBeDefined();
      expect(new Date(result.end_at).getTime() - new Date(result.start_at).getTime()).toBe(60 * 60 * 1000); // 1 hour
    });

    it('should pass through existing dateTime format unchanged', () => {
      const result = convertGoogleAllDayEvent(
        '2024-01-01T10:00:00Z',
        '2024-01-01T11:00:00Z',
        'America/New_York'
      );
      
      expect(result.start_at).toBe('2024-01-01T10:00:00Z');
      expect(result.end_at).toBe('2024-01-01T11:00:00Z');
    });

    it('should handle mixed date formats', () => {
      const result = convertGoogleAllDayEvent(
        '2024-01-01',
        '2024-01-01T11:00:00Z',
        'America/New_York'
      );
      
      // Should pass through as-is since not both are date-only
      expect(result.start_at).toBe('2024-01-01');
      expect(result.end_at).toBe('2024-01-01T11:00:00Z');
    });
  });

  describe('createAllDayEvent', () => {
    it('should create all-day event in user timezone', () => {
      const date = new Date('2024-01-01T10:00:00Z');
      const result = createAllDayEvent(date, 'America/New_York');
      
      expect(result.start_at).toMatch(/2024-01-01T05:00:00\.000Z/); // UTC equivalent of midnight EST
      expect(result.end_at).toMatch(/2024-01-02T05:00:00\.000Z/);
    });

    it('should create multi-day all-day event', () => {
      const date = new Date('2024-01-01T10:00:00Z');
      const result = createAllDayEvent(date, 'America/New_York', 3);
      
      expect(result.start_at).toMatch(/2024-01-01T05:00:00\.000Z/);
      expect(result.end_at).toMatch(/2024-01-04T05:00:00\.000Z/); // 3 days later
    });

    it('should handle undefined timezone', () => {
      const date = new Date('2024-01-01T10:00:00Z');
      const result = createAllDayEvent(date, undefined);
      
      expect(result.start_at).toMatch(/2024-01-01T00:00:00\.000Z/);
      expect(result.end_at).toMatch(/2024-01-02T00:00:00\.000Z/);
    });
  });
}); 