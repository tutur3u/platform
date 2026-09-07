import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { describe, expect, it } from 'vitest';
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
  });
});
