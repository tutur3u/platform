import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { calendarInstantDay, calendarToday } from '../lib/calendar-day';

const dayStamp = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
/** Parse once, binary-search starts, and prune intervals that already ended. */
export function createCalendarEventLookup(
  events: CalendarEvent[],
  timezone?: string
) {
  const intervals = events
    .map((event, order) => {
      const allDay = isAllDayEvent(event);
      const eventDay = (value: string) => {
        const instant = new Date(value);
        if (!Number.isFinite(instant.getTime())) return NaN;
        return dayStamp(
          allDay ? instant : calendarInstantDay(instant, timezone)
        );
      };
      return {
        event,
        order,
        start: eventDay(event.start_at),
        end: eventDay(event.end_at) - (allDay ? 1 : 0),
      };
    })
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
    .sort((a, b) => a.start - b.start);
  let max = -Infinity;
  const latestEnd = intervals.map((item) => (max = Math.max(max, item.end)));
  const cache = new Map<number, CalendarEvent[]>();
  return (date = calendarToday(timezone)) => {
    const target = dayStamp(date);
    const cached = cache.get(target);
    if (cached) return cached;
    let low = 0,
      high = intervals.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (intervals[mid]!.start <= target) low = mid + 1;
      else high = mid;
    }
    const matches: typeof intervals = [];
    for (
      let index = low - 1;
      index >= 0 && latestEnd[index]! >= target;
      index--
    ) {
      const interval = intervals[index]!;
      if (interval.end >= target) matches.push(interval);
    }
    const result = matches
      .sort((a, b) => a.order - b.order)
      .map((item) => item.event);
    if (cache.size >= 400) cache.delete(cache.keys().next().value!);
    cache.set(target, result);
    return result;
  };
}
