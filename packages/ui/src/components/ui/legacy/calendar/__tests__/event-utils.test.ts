import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { describe, expect, it } from 'vitest';
import {
  getNormalizedEndDay,
  isMidnight,
  isMultiDayEvent,
  processCalendarEvent,
} from '../event-utils';

dayjs.extend(utc);
dayjs.extend(timezone);

// Use UTC timezone for all tests to ensure consistent behavior
const TEST_TZ = 'UTC';

describe('event-utils', () => {
  describe('isMidnight', () => {
    it('should return true for exactly midnight (00:00:00.000)', () => {
      // Use UTC timezone to ensure midnight is midnight
      const midnight = dayjs.tz('2024-12-10 00:00:00', TEST_TZ);
      expect(isMidnight(midnight)).toBe(true);
    });

    it('should return false for 12:00 AM with non-zero seconds', () => {
      const notMidnight = dayjs.tz('2024-12-10 00:00:01', TEST_TZ);
      expect(isMidnight(notMidnight)).toBe(false);
    });

    it('should return false for 12:00 AM with non-zero milliseconds', () => {
      const notMidnight = dayjs.tz('2024-12-10 00:00:00.001', TEST_TZ);
      expect(isMidnight(notMidnight)).toBe(false);
    });

    it('should return false for 12:01 AM', () => {
      const notMidnight = dayjs.tz('2024-12-10 00:01:00', TEST_TZ);
      expect(isMidnight(notMidnight)).toBe(false);
    });

    it('should return false for other times', () => {
      expect(isMidnight(dayjs.tz('2024-12-10 12:00:00', TEST_TZ))).toBe(false);
      expect(isMidnight(dayjs.tz('2024-12-10 23:59:59.999', TEST_TZ))).toBe(
        false
      );
      expect(isMidnight(dayjs.tz('2024-12-10 06:30:00', TEST_TZ))).toBe(false);
    });
  });

  describe('getNormalizedEndDay', () => {
    it('should return previous day for midnight', () => {
      const midnight = dayjs.tz('2024-12-10 00:00:00', TEST_TZ);
      const normalized = getNormalizedEndDay(midnight);
      expect(normalized.format('YYYY-MM-DD')).toBe('2024-12-09');
    });

    it('should return same day start for non-midnight times', () => {
      const afternoon = dayjs.tz('2024-12-10 15:30:00', TEST_TZ);
      const normalized = getNormalizedEndDay(afternoon);
      expect(normalized.format('YYYY-MM-DD')).toBe('2024-12-10');
    });

    it('should return same day start for 11:59 PM', () => {
      const lateNight = dayjs.tz('2024-12-10 23:59:59.999', TEST_TZ);
      const normalized = getNormalizedEndDay(lateNight);
      expect(normalized.format('YYYY-MM-DD')).toBe('2024-12-10');
    });
  });

  describe('isMultiDayEvent', () => {
    it('should return false for same-day event', () => {
      const result = isMultiDayEvent(
        dayjs.tz('2024-12-10 10:00:00', TEST_TZ).toISOString(),
        dayjs.tz('2024-12-10 12:00:00', TEST_TZ).toISOString(),
        TEST_TZ
      );
      expect(result).toBe(false);
    });

    it('should return false for event ending at midnight (Mon 10pm - Tue 12am)', () => {
      // Monday 10pm - Tuesday 12am should only show on Monday
      const result = isMultiDayEvent(
        dayjs
          .tz('2024-12-09 22:00:00', TEST_TZ)
          .toISOString(), // Mon 10pm
        dayjs
          .tz('2024-12-10 00:00:00', TEST_TZ)
          .toISOString(), // Tue 12am (midnight)
        TEST_TZ
      );
      expect(result).toBe(false);
    });

    it('should return true for event spanning multiple days (Mon 10pm - Tue 1am)', () => {
      // Monday 10pm - Tuesday 1am should show on both days
      const result = isMultiDayEvent(
        dayjs
          .tz('2024-12-09 22:00:00', TEST_TZ)
          .toISOString(), // Mon 10pm
        dayjs
          .tz('2024-12-10 01:00:00', TEST_TZ)
          .toISOString(), // Tue 1am
        TEST_TZ
      );
      expect(result).toBe(true);
    });

    it('should return true for multi-day event (Mon - Wed)', () => {
      const result = isMultiDayEvent(
        dayjs.tz('2024-12-09 10:00:00', TEST_TZ).toISOString(),
        dayjs.tz('2024-12-11 15:00:00', TEST_TZ).toISOString(),
        TEST_TZ
      );
      expect(result).toBe(true);
    });

    it('should return true for event ending at 12:00:01 AM (just past midnight)', () => {
      // This should still be considered multi-day since end is not exactly midnight
      const result = isMultiDayEvent(
        dayjs.tz('2024-12-09 22:00:00', TEST_TZ).toISOString(),
        dayjs.tz('2024-12-10 00:00:01', TEST_TZ).toISOString(),
        TEST_TZ
      );
      expect(result).toBe(true);
    });
  });

  describe('processCalendarEvent', () => {
    const createEvent = (
      startAt: string,
      endAt: string,
      id = 'test-event'
    ): CalendarEvent => ({
      id,
      title: 'Test Event',
      start_at: startAt,
      end_at: endAt,
      ws_id: 'test-workspace',
    });

    // Helper to create ISO strings in UTC timezone
    const utcTime = (dateStr: string) =>
      dayjs.tz(dateStr, TEST_TZ).toISOString();

    it('should return single event for same-day event', () => {
      const event = createEvent(
        utcTime('2024-12-10 10:00:00'),
        utcTime('2024-12-10 12:00:00')
      );
      const result = processCalendarEvent(event, TEST_TZ);

      expect(result).toHaveLength(1);
      expect(result[0]?._isMultiDay).toBeUndefined();
    });

    it('should NOT split event ending exactly at midnight (Mon 10pm - Tue 12am)', () => {
      const event = createEvent(
        utcTime('2024-12-09 22:00:00'), // Mon 10pm
        utcTime('2024-12-10 00:00:00') // Tue 12am (midnight)
      );
      const result = processCalendarEvent(event, TEST_TZ);

      // Should NOT be split - only appears on Monday
      expect(result).toHaveLength(1);
      expect(result[0]?._isMultiDay).toBeUndefined();
    });

    it('should split event spanning into next day (Mon 10pm - Tue 1am)', () => {
      const event = createEvent(
        utcTime('2024-12-09 22:00:00'), // Mon 10pm
        utcTime('2024-12-10 01:00:00') // Tue 1am
      );
      const result = processCalendarEvent(event, TEST_TZ);

      // Should be split into 2 segments
      expect(result).toHaveLength(2);
      expect(result[0]?._isMultiDay).toBe(true);
      expect(result[0]?._dayPosition).toBe('start');
      expect(result[1]?._isMultiDay).toBe(true);
      expect(result[1]?._dayPosition).toBe('end');
    });

    it('should split 3-day event correctly', () => {
      const event = createEvent(
        utcTime('2024-12-09 10:00:00'), // Mon 10am
        utcTime('2024-12-11 15:00:00') // Wed 3pm
      );
      const result = processCalendarEvent(event, TEST_TZ);

      // Should be split into 3 segments
      expect(result).toHaveLength(3);
      expect(result[0]?._dayPosition).toBe('start');
      expect(result[1]?._dayPosition).toBe('middle');
      expect(result[2]?._dayPosition).toBe('end');
    });

    it('should fix invalid event where end is before start', () => {
      const event = createEvent(
        utcTime('2024-12-10 12:00:00'),
        utcTime('2024-12-10 10:00:00') // End before start
      );
      const result = processCalendarEvent(event, TEST_TZ);

      expect(result).toHaveLength(1);
      // End should be 1 hour after start
      const endTime = dayjs(result[0]?.end_at);
      const startTime = dayjs(result[0]?.start_at);
      expect(endTime.diff(startTime, 'hour')).toBe(1);
    });

    it('should preserve original event ID in _originalId for multi-day events', () => {
      const event = createEvent(
        utcTime('2024-12-09 22:00:00'),
        utcTime('2024-12-10 01:00:00'),
        'my-unique-id'
      );
      const result = processCalendarEvent(event, TEST_TZ);

      expect(result).toHaveLength(2);
      expect(result[0]?._originalId).toBe('my-unique-id');
      expect(result[1]?._originalId).toBe('my-unique-id');
      // New IDs should include date
      expect(result[0]?.id).toContain('my-unique-id');
      expect(result[0]?.id).toContain('2024-12-09');
    });

    it('should handle all-day event ending at midnight correctly', () => {
      // All-day event: Mon 12am - Tue 12am (24 hours)
      const event = createEvent(
        utcTime('2024-12-09 00:00:00'), // Mon 12am
        utcTime('2024-12-10 00:00:00') // Tue 12am
      );
      const result = processCalendarEvent(event, TEST_TZ);

      // Should NOT be split - all-day event only on Monday
      expect(result).toHaveLength(1);
      expect(result[0]?._isMultiDay).toBeUndefined();
    });

    it('should handle 2-day all-day event correctly (Mon 12am - Wed 12am)', () => {
      // 2-day all-day event: Mon 12am - Wed 12am (48 hours)
      const event = createEvent(
        utcTime('2024-12-09 00:00:00'), // Mon 12am
        utcTime('2024-12-11 00:00:00') // Wed 12am
      );
      const result = processCalendarEvent(event, TEST_TZ);

      // Should be split into 2 days (Mon and Tue, not Wed)
      expect(result).toHaveLength(2);
      expect(result[0]?._dayPosition).toBe('start');
      expect(result[1]?._dayPosition).toBe('end');
    });
  });
});
