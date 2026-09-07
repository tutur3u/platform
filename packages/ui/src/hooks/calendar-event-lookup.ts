import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';

const dayStamp = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
/** Parse once, binary-search starts, and prune intervals that already ended. */
export function createCalendarEventLookup(events: CalendarEvent[]) {
  const intervals = events
    .map((event, order) => ({
      event,
      order,
      start: dayStamp(new Date(event.start_at)),
      end: dayStamp(new Date(event.end_at)) - (isAllDayEvent(event) ? 1 : 0),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
    .sort((a, b) => a.start - b.start);
  let max = -Infinity;
  const latestEnd = intervals.map((item) => (max = Math.max(max, item.end)));
  const cache = new Map<number, CalendarEvent[]>();
  return (date = new Date()) => {
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
