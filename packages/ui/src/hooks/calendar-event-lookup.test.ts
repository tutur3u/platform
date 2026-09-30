import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { describe, expect, it, vi } from 'vitest';
import { createCalendarEventLookup } from './calendar-event-lookup';
import {
  type CalendarCache,
  updateCalendarRangeCache,
} from './calendar-range-cache';

const event = (id: string, start: string, end: string): CalendarEvent => ({
  id,
  start_at: start,
  end_at: end,
});
describe('indexed calendar lookup', () => {
  it.each([
    ['Asia/Tokyo', 'America/Los_Angeles', '2026-01-01T07:30:00Z', 2025, 11, 31],
    ['America/Los_Angeles', 'Asia/Tokyo', '2025-12-31T15:30:00Z', 2026, 0, 1],
  ] as const)(
    'groups timed instants in %s browser with %s calendar days',
    (browserZone, calendarZone, instant, year, month, day) => {
      vi.stubEnv('TZ', browserZone);
      try {
        const end = new Date(
          new Date(instant).getTime() + 15 * 60_000
        ).toISOString();
        const lookup = createCalendarEventLookup(
          [event('timed', instant, end)],
          calendarZone
        );
        expect(
          lookup(new Date(year, month, day, 18)).map((item) => item.id)
        ).toEqual(['timed']);
        expect(lookup(new Date(year, month, day + 1))).toEqual([]);
      } finally {
        vi.unstubAllEnvs();
      }
    }
  );
  it('preserves the existing all-day carrier identity when the calendar zone changes', () => {
    vi.stubEnv('TZ', 'UTC');
    try {
      const events = [
        event('all-day', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
      ];
      for (const zone of ['America/Los_Angeles', 'Asia/Tokyo']) {
        const lookup = createCalendarEventLookup(events, zone);
        expect(lookup(new Date(2026, 0, 1))).toHaveLength(1);
        expect(lookup(new Date(2026, 0, 2))).toHaveLength(0);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('preserves event order and exclusive all-day ends across a year boundary', () => {
    const events = [
      event('timed', '2026-12-31T23:00:00', '2027-01-01T01:00:00'),
      event('all-day', '2026-12-31T00:00:00', '2027-01-01T00:00:00'),
    ];
    const lookup = createCalendarEventLookup(events);
    expect(lookup(new Date(2026, 11, 31)).map((item) => item.id)).toEqual([
      'timed',
      'all-day',
    ]);
    expect(lookup(new Date(2027, 0, 1)).map((item) => item.id)).toEqual([
      'timed',
    ]);
    expect(lookup(new Date(2027, 0, 1))).toBe(lookup(new Date(2027, 0, 1)));
  });
  it('excludes the end day of all-day events across daylight saving changes', () => {
    vi.stubEnv('TZ', 'America/New_York');
    try {
      const lookup = createCalendarEventLookup([
        event('dst', '2026-03-08T00:00:00-05:00', '2026-03-09T00:00:00-04:00'),
      ]);
      expect(lookup(new Date(2026, 2, 8))).toHaveLength(1);
      expect(lookup(new Date(2026, 2, 9))).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('handles sparse busy years and invalid event dates', () => {
    const events = Array.from({ length: 3000 }, (_, index) =>
      event(
        String(index),
        new Date(2026, 0, 1 + index, 9).toISOString(),
        new Date(2026, 0, 1 + index, 10).toISOString()
      )
    );
    const lookup = createCalendarEventLookup([
      ...events,
      event('invalid', 'invalid', 'invalid'),
    ]);
    expect(lookup(new Date(2026, 11, 31)).map((item) => item.id)).toEqual([
      '364',
    ]);
  });
  it('bounds workspace-scoped range snapshots and preserves partial cache updates', () => {
    let cache: CalendarCache = {};
    for (let index = 1; index <= 15; index++)
      cache = updateCalendarRangeCache(cache, `workspace:${index}`, {
        dbLastUpdated: index,
      });
    expect(Object.keys(cache)).toHaveLength(12);
    expect(cache['workspace:1']).toBeUndefined();
    cache = updateCalendarRangeCache(cache, 'other-workspace:15', {
      googleLastUpdated: 20,
    });
    expect(cache['workspace:15']?.dbLastUpdated).toBe(15);
    expect(cache['other-workspace:15']?.dbLastUpdated).toBe(0);
    cache = updateCalendarRangeCache(cache, 'active-range', {
      dbLastUpdated: 0,
    });
    expect(cache['active-range']).toBeDefined();
    expect(Object.keys(cache)).toHaveLength(12);
  });
});
