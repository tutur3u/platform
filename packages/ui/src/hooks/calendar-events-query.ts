import type { QueryClient } from '@tanstack/react-query';
import { listWorkspaceCalendarEvents } from '@tuturuuu/internal-api/calendar';
import type { WorkspaceCalendarEvent } from '@tuturuuu/types';
import { calendarQueryRange } from '../lib/calendar-day';
import {
  calendarRangeCacheKey,
  calendarRangeIncludesToday,
} from './calendar-sync-range';

export const CALENDAR_EVENTS_QUERY_ROOT = 'databaseCalendarEvents';
/** A range holding today changes most often, so it revalidates sooner. */
export const CURRENT_RANGE_STALE_MS = 30_000;
export const OTHER_RANGE_STALE_MS = 2 * 60_000;
export const CALENDAR_EVENTS_GC_MS = 30 * 60_000;
export const SIGNED_OUT_ACTOR = 'signed-out';

const DAY_SHIFT_LIMIT = 7;

export function calendarEventsStaleTime(
  dates: Date[],
  timezone?: string,
  now?: Date
) {
  return calendarRangeIncludesToday(dates, timezone, now)
    ? CURRENT_RANGE_STALE_MS
    : OTHER_RANGE_STALE_MS;
}

/**
 * Cache identity of one visible range: `[root, wsId, range, actor]`. The range
 * segment keeps the zone and first/last day so a zone change never reuses rows
 * built for another set of day boundaries, and the actor segment keeps a
 * decrypted snapshot from ever being read by another account.
 */
export function calendarEventsQueryKey(
  wsId: string,
  dates: Date[],
  timezone: string | undefined,
  actorId: string = SIGNED_OUT_ACTOR
) {
  const range = calendarRangeCacheKey(dates, timezone);
  return [
    CALENDAR_EVENTS_QUERY_ROOT,
    wsId,
    range ? `${wsId}:${range}` : '',
    actorId,
  ] as const;
}

export type CalendarEventsQueryKey = ReturnType<typeof calendarEventsQueryKey>;

/**
 * Visible ranges that sit next to the current one: one step back and forward.
 * Only day, 4-day and week grids step by a fixed number of days; month, year
 * and agenda ranges are not shifted because their neighbours are not a day
 * offset of the current dates.
 */
export function adjacentCalendarRanges(dates: Date[]): Date[][] {
  const count = dates.length;
  if (count === 0 || count > DAY_SHIFT_LIMIT) return [];
  // Weekday-only weeks hold 5 dates but still step a full week.
  const step = count >= 5 ? DAY_SHIFT_LIMIT : count;
  const shift = (days: number) =>
    dates.map(
      (date) =>
        new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
    );
  return [shift(-step), shift(step)];
}

export function calendarEventsQueryOptions({
  actorId,
  dates,
  timezone,
  wsId,
}: {
  actorId?: string;
  dates: Date[];
  timezone: string | undefined;
  wsId: string;
}) {
  return {
    queryKey: calendarEventsQueryKey(wsId, dates, timezone, actorId),
    staleTime: calendarEventsStaleTime(dates, timezone),
    gcTime: CALENDAR_EVENTS_GC_MS,
    queryFn: async ({
      signal,
    }: {
      signal?: AbortSignal;
    }): Promise<WorkspaceCalendarEvent[]> => {
      const { start, end } = calendarQueryRange(dates, timezone);
      const result = await listWorkspaceCalendarEvents(
        wsId,
        { start_at: start.toISOString(), end_at: end.toISOString() },
        { signal }
      );
      return (result.data ?? []) as WorkspaceCalendarEvent[];
    },
  };
}

/** Warm the neighbouring ranges; fresh ranges are skipped by `staleTime`. */
export function prefetchAdjacentCalendarRanges(
  queryClient: QueryClient,
  args: {
    actorId?: string;
    dates: Date[];
    timezone: string | undefined;
    wsId: string;
  }
) {
  return Promise.all(
    adjacentCalendarRanges(args.dates).map((dates) =>
      queryClient.prefetchQuery(calendarEventsQueryOptions({ ...args, dates }))
    )
  );
}

/**
 * Placeholder rule: carry the previous range's rows only inside the same
 * workspace and actor, so switching either never shows another scope's data.
 */
export function keepCalendarEventsWithinScope<T>(
  previous: T | undefined,
  previousKey: readonly unknown[] | undefined,
  next: { actorId?: string; wsId: string }
): T | undefined {
  return previousKey?.[1] === next.wsId &&
    previousKey?.[3] === (next.actorId ?? SIGNED_OUT_ACTOR)
    ? previous
    : undefined;
}
