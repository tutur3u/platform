import { describe, expect, it, vi } from 'vitest';
import { calendarQueryRange } from '../lib/calendar-day';
import {
  calendarEventInQueryRange,
  calendarRangeCacheKey,
  calendarRangeIncludesToday,
} from './calendar-sync-range';

describe('calendar query date carriers', () => {
  it('uses the effective device zone for auto cache identity', () => {
    const dates = [new Date(2026, 0, 1)];
    vi.stubEnv('TZ', 'Asia/Tokyo');
    try {
      expect(calendarRangeCacheKey(dates, 'auto')).toBe(
        calendarRangeCacheKey(dates, 'Asia/Tokyo')
      );
      vi.stubEnv('TZ', 'America/Los_Angeles');
      expect(calendarRangeCacheKey(dates, 'auto')).toBe(
        calendarRangeCacheKey(dates, 'America/Los_Angeles')
      );
      expect(calendarRangeCacheKey(dates, 'auto')).not.toBe(
        calendarRangeCacheKey(dates, 'Asia/Tokyo')
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each([
    [2026, 2, 8, '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23],
    [2026, 10, 1, '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25],
  ] as const)(
    'resolves independent New York midnights for %i/%i/%i',
    (year, month, day, start, end, hours) => {
      vi.stubEnv('TZ', 'Asia/Tokyo');
      try {
        const range = calendarQueryRange(
          [new Date(year, month, day, 18)],
          'America/New_York'
        );
        expect(range.start.toISOString()).toBe(start);
        expect(range.end.toISOString()).toBe(end);
        expect(range.end.getTime() - range.start.getTime()).toBe(
          hours * 60 * 60_000
        );
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );

  it('partitions equal selected days by calendar timezone and ignores carrier clock fields', () => {
    const dates = [new Date(2026, 0, 1)];
    expect(calendarRangeCacheKey(dates, 'Asia/Tokyo')).not.toBe(
      calendarRangeCacheKey(dates, 'America/Los_Angeles')
    );
    expect(calendarRangeCacheKey(dates, 'Asia/Tokyo')).toBe(
      calendarRangeCacheKey([new Date(2026, 0, 1, 19)], 'Asia/Tokyo')
    );
    expect(calendarRangeCacheKey([], 'Asia/Tokyo')).toBe('');
  });

  it('detects today in the calendar zone across a year boundary', () => {
    const now = new Date('2025-12-31T16:00:00Z');
    const dates = [new Date(2026, 0, 1)];
    expect(calendarRangeIncludesToday(dates, 'Asia/Tokyo', now)).toBe(true);
    expect(calendarRangeIncludesToday(dates, 'America/Los_Angeles', now)).toBe(
      false
    );
  });

  it('filters optimistic events against the same zoned half-open query range', () => {
    const dates = [new Date(2026, 0, 1)];
    const zone = 'Asia/Tokyo';
    expect(
      calendarEventInQueryRange(
        { start_at: '2025-12-31T15:00:00Z', end_at: '2025-12-31T16:00:00Z' },
        dates,
        zone
      )
    ).toBe(true);
    expect(
      calendarEventInQueryRange(
        { start_at: '2026-01-01T15:00:00Z', end_at: '2026-01-01T16:00:00Z' },
        dates,
        zone
      )
    ).toBe(false);
    expect(
      calendarEventInQueryRange({ start_at: 'invalid' }, dates, zone)
    ).toBe(true);
  });
});
