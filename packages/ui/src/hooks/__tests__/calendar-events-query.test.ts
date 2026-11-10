import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@tuturuuu/internal-api/calendar', () => ({
  listWorkspaceCalendarEvents: mock.list,
}));

import {
  adjacentCalendarRanges,
  CALENDAR_EVENTS_QUERY_ROOT,
  CURRENT_RANGE_STALE_MS,
  calendarEventsQueryKey,
  calendarEventsQueryOptions,
  calendarEventsStaleTime,
  keepCalendarEventsWithinScope,
  OTHER_RANGE_STALE_MS,
  prefetchAdjacentCalendarRanges,
} from '../calendar-events-query';

const week = (day: number, count = 7) =>
  Array.from({ length: count }, (_, index) => new Date(2026, 5, day + index));
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

beforeEach(() => {
  mock.list.mockReset();
  mock.list.mockResolvedValue({ data: [], count: 0 });
});

describe('calendar events range key', () => {
  it('keeps the legacy range segment and scopes the entry to the actor', () => {
    expect(calendarEventsQueryKey('ws', week(22), 'UTC', 'actor-1')).toEqual([
      CALENDAR_EVENTS_QUERY_ROOT,
      'ws',
      'ws:UTC:2026-06-22-2026-06-28',
      'actor-1',
    ]);
    expect(calendarEventsQueryKey('ws', week(22), 'UTC')[3]).toBe('signed-out');
  });

  it('separates zones, ranges and actors', () => {
    const base = calendarEventsQueryKey('ws', week(22), 'UTC', 'a');
    expect(
      calendarEventsQueryKey('ws', week(22), 'Asia/Tokyo', 'a')
    ).not.toEqual(base);
    expect(calendarEventsQueryKey('ws', week(29), 'UTC', 'a')).not.toEqual(
      base
    );
    expect(calendarEventsQueryKey('ws', week(22), 'UTC', 'b')).not.toEqual(
      base
    );
  });

  it('revalidates the range holding today sooner than other ranges', () => {
    const now = new Date(2026, 5, 24, 12);
    expect(calendarEventsStaleTime(week(22), 'UTC', now)).toBe(
      CURRENT_RANGE_STALE_MS
    );
    expect(calendarEventsStaleTime(week(29), 'UTC', now)).toBe(
      OTHER_RANGE_STALE_MS
    );
  });
});

describe('adjacent ranges', () => {
  it('steps a week by seven days in both directions', () => {
    const [previous, next] = adjacentCalendarRanges(week(22));
    expect(previous?.map(isoDay)).toEqual(week(15).map(isoDay));
    expect(next?.map(isoDay)).toEqual(week(29).map(isoDay));
  });

  it('steps a day view by one day and a 4-day view by four', () => {
    const [prevDay, nextDay] = adjacentCalendarRanges(week(22, 1));
    expect(prevDay?.map(isoDay)).toEqual(['2026-6-21']);
    expect(nextDay?.map(isoDay)).toEqual(['2026-6-23']);
    const [prev4, next4] = adjacentCalendarRanges(week(22, 4));
    expect(prev4?.map(isoDay)).toEqual(week(18, 4).map(isoDay));
    expect(next4?.map(isoDay)).toEqual(week(26, 4).map(isoDay));
  });

  it('steps a weekday-only week by a full week', () => {
    const [previous, next] = adjacentCalendarRanges(week(22, 5));
    expect(previous?.[0]).toEqual(new Date(2026, 5, 15));
    expect(next?.at(-1)).toEqual(new Date(2026, 6, 3));
  });

  it('does not shift month, year or agenda ranges, or an empty range', () => {
    expect(adjacentCalendarRanges(week(1, 35))).toEqual([]);
    expect(adjacentCalendarRanges([])).toEqual([]);
  });
});

describe('prefetch', () => {
  const args = { actorId: 'a', dates: week(22), timezone: 'UTC', wsId: 'ws' };

  it('requests the previous and next week bounds for the zone', async () => {
    const client = new QueryClient();
    await prefetchAdjacentCalendarRanges(client, args);
    expect(mock.list).toHaveBeenCalledTimes(2);
    expect(mock.list.mock.calls.map(([, query]) => query.start_at)).toEqual([
      '2026-06-15T00:00:00.000Z',
      '2026-06-29T00:00:00.000Z',
    ]);
    expect(mock.list.mock.calls[0]?.[1].end_at).toBe(
      '2026-06-22T00:00:00.000Z'
    );
    expect(
      client.getQueryData(calendarEventsQueryKey('ws', week(29), 'UTC', 'a'))
    ).toEqual([]);
  });

  it('skips ranges that are still fresh and never refetches them', async () => {
    const client = new QueryClient();
    await prefetchAdjacentCalendarRanges(client, args);
    await prefetchAdjacentCalendarRanges(client, args);
    expect(mock.list).toHaveBeenCalledTimes(2);
  });

  it('does not throw when a neighbour fails to load', async () => {
    mock.list.mockRejectedValue(new Error('offline'));
    await expect(
      prefetchAdjacentCalendarRanges(new QueryClient(), args)
    ).resolves.toBeDefined();
  });

  it('shares one cache entry with the visible query options', async () => {
    const client = new QueryClient();
    await prefetchAdjacentCalendarRanges(client, args);
    const visible = calendarEventsQueryOptions({ ...args, dates: week(29) });
    expect(client.getQueryState(visible.queryKey)?.status).toBe('success');
  });
});

describe('placeholder scope', () => {
  const previousKey = calendarEventsQueryKey('ws', week(22), 'UTC', 'a');
  it('carries rows only inside the same workspace and actor', () => {
    const rows = [{ id: 'event' }];
    expect(
      keepCalendarEventsWithinScope(rows, previousKey, {
        actorId: 'a',
        wsId: 'ws',
      })
    ).toBe(rows);
    expect(
      keepCalendarEventsWithinScope(rows, previousKey, {
        actorId: 'b',
        wsId: 'ws',
      })
    ).toBeUndefined();
    expect(
      keepCalendarEventsWithinScope(rows, previousKey, {
        actorId: 'a',
        wsId: 'other',
      })
    ).toBeUndefined();
    expect(
      keepCalendarEventsWithinScope(rows, undefined, { wsId: 'ws' })
    ).toBeUndefined();
  });
});
